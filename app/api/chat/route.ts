import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateSession,
  appendMessage,
  appendMemory,
  updateSession,
  countMessagesToday,
  DAILY_MESSAGE_LIMIT,
  ChatMessage,
  getOrCreateCharacterDailyState,
  appendRelationshipMilestone,
} from "@/lib/store";
import { computeMood, PresenceContext } from "@/lib/mood";
import { detectJealousyTrigger, JEALOUSY_PROMPT_HINT, buildEmotionPromptHint } from "@/lib/jealousy";
import { pickRelevantMemories, buildMemoryPromptHint } from "@/lib/memory";
import { buildDailyStatePromptHint } from "@/lib/daily-state";
import {
  PERSONA_BASE,
  buildCharacterNameHint,
  buildUserNameHint,
  isLaughterOnlyMessage,
  buildLaughterOnlyHint,
  buildConfessionHint,
} from "@/lib/persona";
import { generateStructuredReply, STRUCTURED_OUTPUT_GUIDE, LLMMessage } from "@/lib/llm";
import { stageForScore, conversationMoodFromEmotion, Emotion, CONFESSED_STAGE } from "@/lib/schema";
import {
  buildAfterMeetupPromptHint,
  buildMeetupCompletedLabel,
  buildMeetupReturnMessage,
  hasRecentMeetupContext,
  isExplicitMeetupRequest,
  recentDeletedMessageHint,
} from "@/lib/events";
import { attemptReconnect } from "@/lib/reconnect";
import { inferMemoryType, milestonesFromTurn } from "@/lib/milestones";
import { isDeveloperRequest } from "@/lib/dev-mode";
import { buildPhotoSharePromptHint, createPhotoShareMessage } from "@/lib/photo-assets";
import { buildChatHistory } from "@/lib/llm-context";

const SESSION_LOAD_ERROR = "이전 대화를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";

function getSessionIdHeader(req: NextRequest): string | null {
  return req.headers.get("x-session-id");
}

function presenceContext(session: { lastConversationMood: string; relationshipStage: string }): PresenceContext {
  return { lastConversationMood: session.lastConversationMood, relationshipStage: session.relationshipStage };
}

export async function GET(req: NextRequest) {
  try {
    const result = await getOrCreateSession(getSessionIdHeader(req));
    if (result.status === "error") {
      return NextResponse.json({ error: SESSION_LOAD_ERROR }, { status: 503 });
    }

    const { session } = result;
    const mood = computeMood(session.lastMessageAt, presenceContext(session));
    const reconnect = await attemptReconnect(session);
    const extraMessages: ChatMessage[] = [reconnect?.reconnectMessage].filter(
      (m): m is ChatMessage => m != null
    );

    return NextResponse.json({
      sessionId: session.id,
      messages: [...session.messages, ...extraMessages],
      mood: reconnect?.mood ?? mood.state,
      relationshipStage: reconnect?.relationshipStage ?? session.relationshipStage,
      userName: session.userName,
      characterName: session.characterName,
      personaType: session.personaType,
      devMode: isDeveloperRequest(req),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "알 수 없는 오류" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    return await handleChatPost(req);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "알 수 없는 오류" },
      { status: 500 }
    );
  }
}

async function handleChatPost(req: NextRequest): Promise<NextResponse> {
  const { message } = (await req.json()) as { message: string };
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message가 필요합니다." }, { status: 400 });
  }

  const result = await getOrCreateSession(getSessionIdHeader(req));
  if (result.status === "error") {
    return NextResponse.json({ error: SESSION_LOAD_ERROR }, { status: 503 });
  }
  const { session } = result;

  const devMode = isDeveloperRequest(req);
  if (!devMode && (await countMessagesToday(session.id)) >= DAILY_MESSAGE_LIMIT) {
    return NextResponse.json(
      { error: "오늘 대화 횟수를 다 썼어요. 내일 다시 이야기해요!" },
      { status: 429 }
    );
  }

  const mood = computeMood(session.lastMessageAt, presenceContext(session));
  const isJealous = detectJealousyTrigger(message); // 보조 신호 — 최종 감정 판단은 LLM의 emotion/intensity가 담당
  const relevantMemories = pickRelevantMemories(session.memories, message);
  const dailyState = await getOrCreateCharacterDailyState(session.id);
  const pendingPhotoMessage = createPhotoShareMessage({
    userMessage: message,
    dailyState,
    timestamp: Date.now(),
  });

  const lastMsg = session.messages[session.messages.length - 1];
  const hadRecentDeletedMessage = lastMsg?.role === "system_event" && lastMsg.eventType === "deleted_message";

  const systemPromptParts = [
    PERSONA_BASE,
    buildCharacterNameHint(session.characterName, session.personaType),
    buildUserNameHint(session.userName),
    `[현재 감정 상태 힌트]\n${mood.promptHint}`,
    STRUCTURED_OUTPUT_GUIDE,
  ];
  const emotionHint = buildEmotionPromptHint(session.emotion as Emotion, session.emotionIntensity);
  if (emotionHint) systemPromptParts.push(emotionHint);
  const deletedHint = recentDeletedMessageHint(hadRecentDeletedMessage);
  if (deletedHint) systemPromptParts.push(deletedHint);
  const laughterHint = buildLaughterOnlyHint(isLaughterOnlyMessage(message));
  if (laughterHint) systemPromptParts.push(laughterHint);
  const confessionHint = buildConfessionHint(session.relationshipScore, session.confessedAt);
  if (confessionHint) systemPromptParts.push(confessionHint);
  if (isJealous) systemPromptParts.push(`[참고 신호]\n${JEALOUSY_PROMPT_HINT}`);
  const memoryHint = buildMemoryPromptHint(relevantMemories);
  if (memoryHint) systemPromptParts.push(`[기억]\n${memoryHint}`);
  const dailyStateHint = buildDailyStatePromptHint(dailyState);
  if (dailyStateHint) systemPromptParts.push(dailyStateHint);
  const afterMeetupHint = buildAfterMeetupPromptHint(
    hasRecentMeetupContext(session.messages),
    session.personaType
  );
  if (afterMeetupHint) systemPromptParts.push(afterMeetupHint);
  const photoShareHint = buildPhotoSharePromptHint(pendingPhotoMessage);
  if (photoShareHint) systemPromptParts.push(photoShareHint);

  const systemPrompt = systemPromptParts.join("\n\n");

  const history: LLMMessage[] = buildChatHistory(session.messages, message);

  let structured;
  try {
    structured = await generateStructuredReply(systemPrompt, history, { maxTokens: 480 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "LLM 호출 실패" },
      { status: 500 }
    );
  }

  const now = Date.now();
  await appendMessage(session.id, { role: "user", content: message, timestamp: now });

  // 이미 고백이 끝난 세션이면 LLM이 event를 또 confession_ending으로 표시해도 무시한다 —
  // 매 턴 "연인이 됐어요" 배너가 반복되는 걸 막는 서버 쪽 안전장치 (프롬프트만으로는 100% 못 막음).
  const justConfessed = structured.event?.type === "confession_ending" && !session.confessedAt;
  const canCreateMeetup = isExplicitMeetupRequest(message);

  let replyEventType: ChatMessage["eventType"] = null;
  let photoMessage: ChatMessage | null = null;
  const extraMessages: ChatMessage[] = [];

  if (structured.event?.type === "deleted_message") {
    await appendMessage(session.id, {
      role: "system_event",
      content: "메시지를 삭제했습니다.",
      timestamp: now,
      eventType: "deleted_message",
    });
  } else if (structured.message) {
    replyEventType =
      structured.event?.type === "call_request"
        ? "call_request"
        : structured.event?.type === "meetup_request"
          ? canCreateMeetup
            ? "meetup_request"
            : null
          : justConfessed
            ? "confession_ending"
            : null;
    await appendMessage(session.id, {
      role: "assistant",
      content: structured.message,
      timestamp: now,
      eventType: replyEventType,
    });

    photoMessage = pendingPhotoMessage ? { ...pendingPhotoMessage, timestamp: now + 1 } : null;
    if (photoMessage) {
      await appendMessage(session.id, photoMessage);
    }

    if (replyEventType === "meetup_request") {
      const meetupCompletedMessage: ChatMessage = {
        role: "system_event",
        content: buildMeetupCompletedLabel(),
        timestamp: now + 2,
        eventType: "meetup_completed",
      };
      const meetupReturnMessage: ChatMessage = {
        role: "assistant",
        content: buildMeetupReturnMessage(session.personaType),
        timestamp: now + 3,
        eventType: null,
      };
      await appendMessage(session.id, meetupCompletedMessage);
      await appendMessage(session.id, meetupReturnMessage);
      extraMessages.push(meetupCompletedMessage, meetupReturnMessage);
    }
  }

  const relationshipScore = Math.max(0, Math.min(100, session.relationshipScore + structured.relationshipDelta));
  const relationshipStage =
    justConfessed || session.confessedAt ? CONFESSED_STAGE : stageForScore(relationshipScore);
  await updateSession(session.id, {
    relationshipScore,
    relationshipStage,
    emotion: structured.emotion,
    emotionIntensity: structured.intensity,
    lastConversationMood: conversationMoodFromEmotion(structured.emotion),
    lastActiveAt: now,
    ...(justConfessed ? { confessedAt: now } : {}),
  });

  const milestones = milestonesFromTurn({
    emotion: structured.emotion,
    eventType: replyEventType ?? structured.event?.type ?? null,
    userMessage: message,
    assistantMessage: structured.message,
  });
  await Promise.all(milestones.map((milestone) => appendRelationshipMilestone(session.id, milestone)));

  if (structured.memory) {
    const memoryType = inferMemoryType({
      emotion: structured.emotion,
      eventType: replyEventType ?? structured.event?.type ?? null,
      memory: structured.memory,
    });
    await appendMemory(session.id, structured.memory, memoryType);
  }

  return NextResponse.json({
    sessionId: session.id,
    characterName: session.characterName,
    personaType: session.personaType,
    reply: structured.message,
    event: structured.event,
    mood: mood.state,
    relationshipStage,
    isJealous,
    devMode,
    photoMessage,
    extraMessages,
  });
}
