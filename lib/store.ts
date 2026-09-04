// Supabase 기반 세션 저장소. 익명 session_id로 식별하며 로그인은 없다.
// sessions / messages / memories 중심의 저장소. 추가 관계 경험 테이블은 0006 migration 참고.

import { supabase } from "./supabase";
import { createCharacterDailyState } from "./daily-state";
import { isExplicitMeetupRequest } from "./events";
import { koreanDateKey } from "./korean-date";
import { MilestoneDraft } from "./milestones";
import {
  PERSONA_NAME,
  PersonaType,
  personaTypeForName,
  pickCharacterProfile,
  pickInitialMessage,
} from "./persona";

export interface ChatMessage {
  role: "user" | "assistant" | "system_event";
  content: string;
  timestamp: number;
  eventType?:
    | "deleted_message"
    | "reconnect_first_message"
    | "call_request"
    | "call_ended"
    | "confession_ending"
    | "photo_shared"
    | "meetup_request"
    | "meetup_completed"
    | null;
  metadata?: MessageMetadata | null;
}

export interface PhotoAttachment {
  url: string;
  alt: string;
  credit: string;
  sourceUrl: string;
  license: string;
}

export interface MessageMetadata {
  photo?: PhotoAttachment;
  localReply?: boolean;
}

export interface Memory {
  id: string;
  text: string;
  type: "user" | "relationship";
  createdAt: number;
  lastMentionedAt: number | null;
  importance: number;
}

export interface Milestone {
  id: string;
  type: string;
  title: string;
  description: string | null;
  createdAt: number;
}

export interface CharacterDailyState {
  dateKey: string;
  mood: string;
  event: string | null;
  thoughtAboutUser: string | null;
  createdAt: number;
}

export interface SessionData {
  id: string;
  messages: ChatMessage[];
  memories: Memory[];
  milestones: Milestone[];
  lastMessageAt: number | null;
  relationshipStage: string;
  relationshipScore: number;
  emotion: string;
  emotionIntensity: number;
  lastConversationMood: string;
  userName: string | null;
  characterName: string;
  personaType: PersonaType;
  confessedAt: number | null;
}

interface SessionRow {
  id: string;
  relationship_stage: string;
  relationship_score: number;
  emotion: string;
  emotion_intensity: number;
  last_conversation_mood: string;
  last_active_at: string | null;
  user_name: string | null;
  character_name?: string | null;
  persona_type?: PersonaType | null;
  confessed_at: string | null;
}

interface MessageRow {
  role: string;
  content: string;
  event_type: string | null;
  metadata?: MessageMetadata | null;
  created_at: string;
}

const SESSION_COLUMNS =
  "id, relationship_stage, relationship_score, emotion, emotion_intensity, last_conversation_mood, last_active_at, user_name, character_name, persona_type, confessed_at";

const FALLBACK_SESSION_COLUMNS =
  "id, relationship_stage, relationship_score, emotion, emotion_intensity, last_conversation_mood, last_active_at, user_name, confessed_at";

export type SessionResult =
  | { status: "ok"; session: SessionData; isNew: boolean }
  | { status: "error" };

function rowToSessionData(
  row: SessionRow,
  messages: ChatMessage[],
  memories: Memory[],
  milestones: Milestone[]
): SessionData {
  return {
    id: row.id,
    messages,
    memories,
    milestones,
    lastMessageAt: row.last_active_at ? new Date(row.last_active_at).getTime() : null,
    relationshipStage: row.relationship_stage,
    relationshipScore: row.relationship_score,
    emotion: row.emotion,
    emotionIntensity: Number(row.emotion_intensity),
    lastConversationMood: row.last_conversation_mood,
    userName: row.user_name,
    characterName: row.character_name ?? PERSONA_NAME,
    personaType: row.persona_type ?? personaTypeForName(row.character_name ?? PERSONA_NAME),
    confessedAt: row.confessed_at ? new Date(row.confessed_at).getTime() : null,
  };
}

async function loadSessionRow(sessionId: string): Promise<{ row: SessionRow | null; error: unknown }> {
  const { data, error } = await supabase
    .from("sessions")
    .select(SESSION_COLUMNS)
    .eq("id", sessionId)
    .maybeSingle();
  if (!error) return { row: data as SessionRow | null, error: null };

  const fallback = await supabase
    .from("sessions")
    .select(FALLBACK_SESSION_COLUMNS)
    .eq("id", sessionId)
    .maybeSingle();
  return { row: fallback.data as SessionRow | null, error: fallback.error };
}

async function createSessionRow(): Promise<{ row: SessionRow | null; error: unknown }> {
  const sessionSeed = crypto.randomUUID();
  const profile = pickCharacterProfile(sessionSeed);
  const { data, error } = await supabase
    .from("sessions")
    .insert({ id: sessionSeed, character_name: profile.name, persona_type: profile.personaType })
    .select(SESSION_COLUMNS)
    .single();
  if (!error) return { row: data as SessionRow, error: null };

  const fallback = await supabase
    .from("sessions")
    .insert({ id: sessionSeed })
    .select(FALLBACK_SESSION_COLUMNS)
    .single();
  return { row: fallback.data as SessionRow | null, error: fallback.error };
}

// 인증 없이 누구나 세션을 만들 수 있는 구조라, LLM 호출을 유발하는 요청(채팅 전송/통화 종료)에
// 세션당 하루 한도를 걸어둔다 — 안 걸면 스크립트로 두드렸을 때 Anthropic 비용이 무제한으로 늘어난다.
export const DAILY_MESSAGE_LIMIT = 30;
export const FEEDBACK_BONUS_MESSAGE_LIMIT = 20;

function startOfTodayKST(): Date {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  const kstMidnight = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate());
  return new Date(kstMidnight - KST_OFFSET_MS);
}

/** 이 세션이 오늘(KST 기준) LLM 호출을 유발한 유저 턴 수 — 한도 체크용. */
export async function countMessagesToday(sessionId: string): Promise<number> {
  const { data, error } = await supabase
    .from("messages")
    .select("metadata")
    .eq("session_id", sessionId)
    .eq("role", "user")
    .gte("created_at", startOfTodayKST().toISOString());

  if (!error && data) {
    return data.filter((row) => (row.metadata as MessageMetadata | null)?.localReply !== true).length;
  }

  const fallback = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("role", "user")
    .gte("created_at", startOfTodayKST().toISOString());
  if (fallback.error) return 0;
  return fallback.count ?? 0;
}

export async function getFeedbackBonusCountToday(sessionId: string): Promise<number> {
  const { data, error } = await supabase
    .from("feedback_bonus_requests")
    .select("bonus_count")
    .eq("session_id", sessionId)
    .eq("date_key", koreanDateKey())
    .maybeSingle();
  if (error || !data) return 0;
  return Number(data.bonus_count) || 0;
}

export async function getDailyMessageLimit(sessionId: string): Promise<number> {
  return DAILY_MESSAGE_LIMIT + (await getFeedbackBonusCountToday(sessionId));
}

export async function saveFeedbackBonusRequest(
  session: SessionData,
  content: string,
  dailyMessageCount: number
): Promise<{ status: "created"; bonusCount: number } | { status: "already_exists"; bonusCount: number } | { status: "error" }> {
  const dateKey = koreanDateKey();
  const lastUserMessage = [...session.messages].reverse().find((m) => m.role === "user") ?? null;
  const lastAssistantMessage = [...session.messages].reverse().find((m) => m.role === "assistant") ?? null;
  const lastEvent = [...session.messages].reverse().find((m) => m.eventType) ?? null;

  const { error } = await supabase.from("feedback_bonus_requests").insert({
    session_id: session.id,
    content,
    bonus_count: FEEDBACK_BONUS_MESSAGE_LIMIT,
    date_key: dateKey,
    daily_message_count: dailyMessageCount,
    total_message_count: session.messages.length,
    relationship_stage: session.relationshipStage,
    relationship_score: session.relationshipScore,
    emotion: session.emotion,
    emotion_intensity: session.emotionIntensity,
    character_name: session.characterName,
    persona_type: session.personaType,
    last_user_message: lastUserMessage?.content ?? null,
    last_assistant_message: lastAssistantMessage?.content ?? null,
    last_event_type: lastEvent?.eventType ?? null,
  });

  if (!error) return { status: "created", bonusCount: FEEDBACK_BONUS_MESSAGE_LIMIT };
  if (String((error as { code?: string }).code ?? "") === "23505") {
    return { status: "already_exists", bonusCount: await getFeedbackBonusCountToday(session.id) };
  }
  return { status: "error" };
}

async function loadMessages(sessionId: string): Promise<ChatMessage[]> {
  const query = supabase
    .from("messages")
    .select("role, content, event_type, metadata, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  let { data, error } = await query as { data: MessageRow[] | null; error: unknown };

  if (error) {
    const fallback = await supabase
      .from("messages")
      .select("role, content, event_type, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    data = fallback.data as MessageRow[] | null;
    error = fallback.error;
  }

  if (error || !data) return [];
  const messages = data
    .filter((m) => m.event_type !== "time_skip")
    .map((m) => ({
      role: m.role as ChatMessage["role"],
      content: m.content,
      timestamp: new Date(m.created_at).getTime(),
      eventType: (m.event_type as ChatMessage["eventType"]) ?? null,
      metadata: "metadata" in m ? (m.metadata as MessageMetadata | null) : null,
    }));
  return hideInvalidMeetupSequences(messages);
}

function looksLikeMeetupReturnMessage(message: ChatMessage): boolean {
  if (message.role !== "assistant") return false;
  return /(집\s*(잘\s*)?들어갔어|문\s*잠그고|집\s*가는\s*길|다시\s*(가|움직이는)\s*중|다시\s*할\s*일|아까\s*(잠깐\s*)?(본|헤어질|재밌))/u.test(
    message.content
  );
}

function hideInvalidMeetupSequences(messages: ChatMessage[]): ChatMessage[] {
  const sanitized: ChatMessage[] = [];
  let skipInvalidMeetupCompleted = false;
  let skipInvalidMeetupReturn = false;

  for (const message of messages) {
    if (skipInvalidMeetupCompleted && message.eventType === "meetup_completed") {
      skipInvalidMeetupCompleted = false;
      skipInvalidMeetupReturn = true;
      continue;
    }

    if (skipInvalidMeetupReturn && looksLikeMeetupReturnMessage(message)) {
      skipInvalidMeetupReturn = false;
      continue;
    }

    skipInvalidMeetupReturn = false;

    if (message.eventType === "meetup_request") {
      const previousUserMessage = [...sanitized].reverse().find((m) => m.role === "user");
      if (!previousUserMessage || !isExplicitMeetupRequest(previousUserMessage.content)) {
        sanitized.push({ ...message, eventType: null });
        skipInvalidMeetupCompleted = true;
        continue;
      }
    }

    sanitized.push(message);
  }

  return sanitized;
}

async function loadMemories(sessionId: string): Promise<Memory[]> {
  const { data, error } = await supabase
    .from("memories")
    .select("id, content, memory_type, importance, created_at, last_used_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error || !data) {
    const fallback = await supabase
      .from("memories")
      .select("id, content, importance, created_at, last_used_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (fallback.error || !fallback.data) return [];
    return fallback.data.map((m) => ({
      id: String(m.id),
      text: m.content,
      type: "user",
      createdAt: new Date(m.created_at).getTime(),
      lastMentionedAt: m.last_used_at ? new Date(m.last_used_at).getTime() : null,
      importance: Number(m.importance),
    }));
  }
  return data.map((m) => ({
    id: String(m.id),
    text: m.content,
    type: ((m.memory_type as Memory["type"] | null) ?? "user"),
    createdAt: new Date(m.created_at).getTime(),
    lastMentionedAt: m.last_used_at ? new Date(m.last_used_at).getTime() : null,
    importance: Number(m.importance),
  }));
}

async function loadMilestones(sessionId: string): Promise<Milestone[]> {
  const { data, error } = await supabase
    .from("relationship_milestones")
    .select("id, type, title, description, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((m) => ({
    id: String(m.id),
    type: m.type,
    title: m.title,
    description: m.description,
    createdAt: new Date(m.created_at).getTime(),
  }));
}

/**
 * sessionId가 없으면 새 세션을 만든다.
 * sessionId가 있는데 DB에 없으면(오래된 localStorage 등) 새 세션을 만든다 — 덮어쓰지 않음.
 * sessionId가 있는데 조회 자체가 실패하면(네트워크/장애) status: "error"를 반환한다 —
 * 이 경우 호출부는 새 세션을 만들면 안 된다 ("없음"과 "실패"를 구분).
 */
export async function getOrCreateSession(sessionId: string | null): Promise<SessionResult> {
  if (sessionId) {
    const { row, error } = await loadSessionRow(sessionId);

    if (error) return { status: "error" };

    if (row) {
      const [messages, memories, milestones] = await Promise.all([
        loadMessages(row.id),
        loadMemories(row.id),
        loadMilestones(row.id),
      ]);
      return { status: "ok", isNew: false, session: rowToSessionData(row, messages, memories, milestones) };
    }
    // 조회는 성공했지만 해당 세션이 없음 → 새로 생성
  }

  const { row, error } = await createSessionRow();

  if (error || !row) return { status: "error" };
  return { status: "ok", isNew: true, session: rowToSessionData(row, [], [], []) };
}

export async function appendInitialMessageIfNeeded(session: SessionData): Promise<ChatMessage | null> {
  if (session.messages.length > 0) return null;

  const initialMessage: ChatMessage = {
    role: "assistant",
    content: pickInitialMessage(session.id),
    timestamp: Date.now(),
    eventType: null,
  };
  await appendMessage(session.id, initialMessage);
  return initialMessage;
}

export async function appendMessage(sessionId: string, message: ChatMessage): Promise<void> {
  const row: {
    session_id: string;
    role: ChatMessage["role"];
    content: string;
    event_type: ChatMessage["eventType"];
    created_at: string;
    metadata?: MessageMetadata | null;
  } = {
    session_id: sessionId,
    role: message.role,
    content: message.content,
    event_type: message.eventType ?? null,
    created_at: new Date(message.timestamp).toISOString(),
  };

  if (message.metadata) {
    row.metadata = message.metadata;
  }

  const { error } = await supabase.from("messages").insert(row);
  if (!error) return;

  if (message.metadata) {
    await supabase.from("messages").insert({
      session_id: sessionId,
      role: message.role,
      content: message.content,
      event_type: message.eventType ?? null,
      created_at: new Date(message.timestamp).toISOString(),
    });
  }
}

function normalizeMemoryText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlapRatio(a: string, b: string): number {
  const aTokens = new Set(normalizeMemoryText(a).split(" ").filter(Boolean));
  const bTokens = new Set(normalizeMemoryText(b).split(" ").filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  return overlap / Math.min(aTokens.size, bTokens.size);
}

async function hasDuplicateMemory(sessionId: string, text: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("memories")
    .select("content, created_at")
    .eq("session_id", sessionId)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data) return false;

  const normalized = normalizeMemoryText(text);
  return data.some((m) => {
    const existing = normalizeMemoryText(m.content);
    return existing === normalized || tokenOverlapRatio(existing, normalized) >= 0.8;
  });
}

export async function appendMemory(
  sessionId: string,
  text: string,
  type: Memory["type"] = "user",
  importance = 0.5
): Promise<Memory | null> {
  if (await hasDuplicateMemory(sessionId, text)) return null;

  const { data, error } = await supabase
    .from("memories")
    .insert({ session_id: sessionId, content: text, memory_type: type, importance })
    .select("id, content, memory_type, importance, created_at, last_used_at")
    .single();

  if (error) {
    const fallback = await supabase
      .from("memories")
      .insert({ session_id: sessionId, content: text, importance })
      .select("id, content, importance, created_at, last_used_at")
      .single();
    if (fallback.error) return null;
    return {
      id: String(fallback.data?.id ?? ""),
      text,
      type: "user",
      createdAt: fallback.data?.created_at ? new Date(fallback.data.created_at).getTime() : Date.now(),
      lastMentionedAt: null,
      importance,
    };
  }

  return {
    id: String(data?.id ?? ""),
    text,
    type: ((data?.memory_type as Memory["type"] | null) ?? type),
    createdAt: data?.created_at ? new Date(data.created_at).getTime() : Date.now(),
    lastMentionedAt: null,
    importance,
  };
}

export async function appendRelationshipMilestone(
  sessionId: string,
  milestone: MilestoneDraft | undefined
): Promise<void> {
  if (!milestone) return;
  await supabase
    .from("relationship_milestones")
    .upsert(
      {
        session_id: sessionId,
        type: milestone.type,
        title: milestone.title,
        description: milestone.description ?? null,
      },
      { onConflict: "session_id,type", ignoreDuplicates: true }
    );
}

export async function getOrCreateCharacterDailyState(sessionId: string): Promise<CharacterDailyState | null> {
  const dateKey = koreanDateKey();
  const { data, error } = await supabase
    .from("character_daily_states")
    .select("date_key, mood, event, thought_about_user, created_at")
    .eq("session_id", sessionId)
    .eq("date_key", dateKey)
    .maybeSingle();

  if (!error && data) {
    return {
      dateKey: data.date_key,
      mood: data.mood,
      event: data.event,
      thoughtAboutUser: data.thought_about_user,
      createdAt: new Date(data.created_at).getTime(),
    };
  }

  if (error && !String(error.message ?? "").includes("does not exist")) return null;

  const state = createCharacterDailyState(sessionId, dateKey);
  const saved = await supabase
    .from("character_daily_states")
    .insert({
      session_id: sessionId,
      date_key: state.dateKey,
      mood: state.mood,
      event: state.event,
      thought_about_user: state.thoughtAboutUser,
    })
    .select("date_key, mood, event, thought_about_user, created_at")
    .single();

  if (saved.error || !saved.data) return state;
  return {
    dateKey: saved.data.date_key,
    mood: saved.data.mood,
    event: saved.data.event,
    thoughtAboutUser: saved.data.thought_about_user,
    createdAt: new Date(saved.data.created_at).getTime(),
  };
}

export interface SessionPatch {
  relationshipStage?: string;
  relationshipScore?: number;
  emotion?: string;
  emotionIntensity?: number;
  lastConversationMood?: string;
  lastActiveAt?: number;
  userName?: string | null;
  confessedAt?: number;
}

export async function updateSession(sessionId: string, patch: SessionPatch): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.relationshipStage !== undefined) update.relationship_stage = patch.relationshipStage;
  if (patch.relationshipScore !== undefined) update.relationship_score = patch.relationshipScore;
  if (patch.emotion !== undefined) update.emotion = patch.emotion;
  if (patch.emotionIntensity !== undefined) update.emotion_intensity = patch.emotionIntensity;
  if (patch.lastConversationMood !== undefined) update.last_conversation_mood = patch.lastConversationMood;
  if (patch.confessedAt !== undefined) update.confessed_at = new Date(patch.confessedAt).toISOString();
  if (patch.lastActiveAt !== undefined) update.last_active_at = new Date(patch.lastActiveAt).toISOString();
  if (patch.userName !== undefined) update.user_name = patch.userName;

  await supabase.from("sessions").update(update).eq("id", sessionId);
}

/**
 * "재접속 시 먼저 말 걸기"를 시작해도 되는지 DB 레벨에서 선점한다. last_active_at이
 * debounceMs 이내에 이미 갱신됐다면(동시에 들어온 다른 요청이 방금 선점했다면) false를 반환한다.
 * React StrictMode의 이중 마운트나, 탭 폴링과 수동 새로고침이 겹치는 경우 등으로 같은 세션에
 * 거의 동시에 여러 요청이 들어와도 재접속 메시지가 중복 생성되지 않게 막는 용도.
 */
export async function claimReconnectSlot(sessionId: string, debounceMs = 10000): Promise<boolean> {
  const cutoff = new Date(Date.now() - debounceMs).toISOString();
  const { data, error } = await supabase
    .from("sessions")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", sessionId)
    .lt("last_active_at", cutoff)
    .select("id");
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function savePushSubscription(sessionId: string, sub: PushSubscriptionRecord): Promise<void> {
  await supabase
    .from("push_subscriptions")
    .upsert(
      { session_id: sessionId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      { onConflict: "endpoint" }
    );
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

export async function loadPushSubscriptions(sessionId: string): Promise<PushSubscriptionRecord[]> {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("session_id", sessionId);
  if (error || !data) return [];
  return data;
}

/**
 * 알림을 보낼지 검토해야 하는 세션의 id 목록 — 최근 활동이 minElapsedMs보다 오래됐고
 * 구독이 하나라도 있는 세션만 후보로 좁힌다 (cron이 매번 전체 세션에 LLM을 호출하지 않도록).
 */
export async function listSessionsNeedingPresenceCheck(minElapsedMs: number): Promise<string[]> {
  const cutoff = new Date(Date.now() - minElapsedMs).toISOString();
  const { data, error } = await supabase
    .from("sessions")
    .select("id, push_subscriptions!inner(session_id)")
    .lt("last_active_at", cutoff)
    .not("last_active_at", "is", null);
  if (error || !data) return [];
  return data.map((row) => row.id as string);
}
