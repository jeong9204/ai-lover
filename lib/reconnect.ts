// "재접속 시 먼저 말 걸기" 오케스트레이션. 원래 app/api/chat/route.ts의 GET 핸들러 안에 있던
// 로직을 그대로 추출했다 — 유저가 직접 탭을 다시 열었을 때(GET)뿐 아니라, 백그라운드 cron이
// "이 세션 지금 먼저 말 걸어야 하나?"를 확인할 때도 같은 로직을 재사용하기 위해서다.

import { computeMood, MoodState } from "./mood";
import { buildEmotionPromptHint } from "./jealousy";
import { pickSpontaneousMemory, buildMemoryPromptHint } from "./memory";
import { PERSONA_BASE, buildCharacterNameHint, buildUserNameHint } from "./persona";
import { generateStructuredReply, STRUCTURED_OUTPUT_GUIDE, LLMMessage } from "./llm";
import { stageForScore, conversationMoodFromEmotion, Emotion } from "./schema";
import { shouldSendReconnectMessage, buildReconnectTrigger } from "./events";
import {
  appendMessage,
  updateSession,
  claimReconnectSlot,
  ChatMessage,
  SessionData,
  getOrCreateCharacterDailyState,
  appendRelationshipMilestone,
} from "./store";
import { buildDailyStatePromptHint } from "./daily-state";
import { milestonesFromTurn } from "./milestones";

export interface ReconnectResult {
  reconnectMessage: ChatMessage | null;
  mood: MoodState;
  relationshipStage: string;
}

/**
 * 세션의 Presence 상태를 확인해서, 필요하면 캐릭터의 먼저 말걸기 메시지를 생성/저장한다.
 * 경과 시간은 감정/선톡 판단에만 쓰고, 화면의 날짜 구분은 실제 메시지 timestamp로 렌더링한다.
 * 아무것도 할 게 없으면(방금 대화했거나 mood가 calm이면) null을 반환한다.
 */
export async function attemptReconnect(session: SessionData): Promise<ReconnectResult | null> {
  const hasHistory = session.messages.length > 0;
  if (!hasHistory) return null;

  const mood = computeMood(session.lastMessageAt, {
    lastConversationMood: session.lastConversationMood,
    relationshipStage: session.relationshipStage,
  });

  // 선톡이 실제로 필요한지 먼저 판단한다. claimReconnectSlot은 last_active_at을 "지금"으로
  // 갱신하므로, 단순히 시간이 지났다는 이유만으로 호출하면 Presence가 리셋되어 버린다.
  const wantsReconnectMessage = shouldSendReconnectMessage(mood.state);
  if (!wantsReconnectMessage) return null;

  // 동시에 여러 요청이 이 세션을 확인하더라도(개발 모드의 이중 마운트, 탭 폴링과 새로고침이
  // 겹치는 경우 등) 한 번만 처리되도록 선점한다. 실패하면 이미 누군가 처리 중/처리 완료.
  const claimed = await claimReconnectSlot(session.id);
  if (!claimed) return null;

  let reconnectMessage: ChatMessage | null = null;
  let relationshipStage = session.relationshipStage;

  const emotionHint = buildEmotionPromptHint(session.emotion as Emotion, session.emotionIntensity);
  const dailyState = await getOrCreateCharacterDailyState(session.id);
  const dailyStateHint = buildDailyStatePromptHint(dailyState);
  const spontaneousMemory = pickSpontaneousMemory(session.memories);
  const memoryHint = buildMemoryPromptHint(spontaneousMemory ? [spontaneousMemory] : []);
  const systemPromptParts = [
    PERSONA_BASE,
    buildCharacterNameHint(session.characterName, session.personaType),
    buildUserNameHint(session.userName),
    `[현재 감정 상태 힌트]\n${mood.promptHint}`,
    STRUCTURED_OUTPUT_GUIDE,
  ];
  if (emotionHint) systemPromptParts.push(emotionHint);
  if (dailyStateHint) systemPromptParts.push(dailyStateHint);
  if (memoryHint) systemPromptParts.push(`[먼저 연락할 때 떠올릴 수 있는 기억]\n${memoryHint}`);
  const systemPrompt = systemPromptParts.join("\n\n");

  const history: LLMMessage[] = session.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-12)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  history.push({ role: "user", content: buildReconnectTrigger(mood.elapsedMs, mood.state) });

  try {
    const structured = await generateStructuredReply(systemPrompt, history);
    const now = Date.now();

    if (structured.message && structured.event?.type !== "deleted_message") {
      reconnectMessage = {
        role: "assistant",
        content: structured.message,
        timestamp: now,
        eventType: "reconnect_first_message",
      };
      await appendMessage(session.id, reconnectMessage);
      await appendRelationshipMilestone(
        session.id,
        milestonesFromTurn({ emotion: structured.emotion, eventType: "reconnect_first_message" })[0]
      );
    }

    const relationshipScore = Math.max(0, Math.min(100, session.relationshipScore + structured.relationshipDelta));
    relationshipStage = stageForScore(relationshipScore);
    await updateSession(session.id, {
      relationshipScore,
      relationshipStage,
      emotion: structured.emotion,
      emotionIntensity: structured.intensity,
      lastConversationMood: conversationMoodFromEmotion(structured.emotion),
      lastActiveAt: now,
    });
  } catch {
    // 먼저 말 걸기 생성 실패는 조용히 무시 — 호출부(세션 로드/cron) 흐름을 막지 않는다.
  }

  if (!reconnectMessage) return null;
  return { reconnectMessage, mood: mood.state, relationshipStage };
}
