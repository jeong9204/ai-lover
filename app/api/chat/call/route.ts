// 통화 종료 처리 — 실제 음성 통화가 아니라 프런트에서 시뮬레이션한 "전화 화면"이 끝난 뒤
// 호출된다. 통화 시간을 구분선으로 남기고, 통화가 막 끝난 여운이 묻어나는 후속 대사를
// generateStructuredReply()로 한 번 더 생성한다 (reconnect의 "먼저 말 걸기"와 같은 패턴).

import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateSession,
  appendMessage,
  updateSession,
  countMessagesToday,
  DAILY_MESSAGE_LIMIT,
  ChatMessage,
  getOrCreateCharacterDailyState,
  appendRelationshipMilestone,
  appendMemory,
} from "@/lib/store";
import { computeMood } from "@/lib/mood";
import { buildEmotionPromptHint } from "@/lib/jealousy";
import { PERSONA_BASE, buildCharacterNameHint, buildUserNameHint } from "@/lib/persona";
import { generateStructuredReply, STRUCTURED_OUTPUT_GUIDE, LLMMessage } from "@/lib/llm";
import { stageForScore, conversationMoodFromEmotion, Emotion } from "@/lib/schema";
import { buildCallEndedLabel, buildCallEndedTrigger } from "@/lib/events";
import { buildDailyStatePromptHint } from "@/lib/daily-state";
import { inferMemoryType, milestonesFromTurn } from "@/lib/milestones";
import { isDeveloperRequest } from "@/lib/dev-mode";

const SESSION_LOAD_ERROR = "이전 대화를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";
const MAX_DURATION_SEC = 3600;

export async function POST(req: NextRequest) {
  try {
    return await handleCallPost(req);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "알 수 없는 오류" },
      { status: 500 }
    );
  }
}

async function handleCallPost(req: NextRequest): Promise<NextResponse> {
  const { durationSec } = (await req.json()) as { durationSec?: number };
  if (typeof durationSec !== "number" || !Number.isFinite(durationSec) || durationSec < 0) {
    return NextResponse.json({ error: "durationSec이 필요합니다." }, { status: 400 });
  }
  const clampedDuration = Math.min(Math.round(durationSec), MAX_DURATION_SEC);

  const result = await getOrCreateSession(req.headers.get("x-session-id"));
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

  const now = Date.now();
  const callEndedMessage: ChatMessage = {
    role: "system_event",
    content: buildCallEndedLabel(clampedDuration),
    timestamp: now,
    eventType: "call_ended",
  };
  await appendMessage(session.id, callEndedMessage);
  await appendRelationshipMilestone(
    session.id,
    milestonesFromTurn({ emotion: session.emotion as Emotion, eventType: "call_ended", durationSec: clampedDuration })[0]
  );

  const mood = computeMood(session.lastMessageAt, {
    lastConversationMood: session.lastConversationMood,
    relationshipStage: session.relationshipStage,
  });
  const emotionHint = buildEmotionPromptHint(session.emotion as Emotion, session.emotionIntensity);
  const dailyStateHint = buildDailyStatePromptHint(await getOrCreateCharacterDailyState(session.id));
  const systemPromptParts = [
    PERSONA_BASE,
    buildCharacterNameHint(session.characterName, session.personaType),
    buildUserNameHint(session.userName),
    `[현재 감정 상태 힌트]\n${mood.promptHint}`,
    STRUCTURED_OUTPUT_GUIDE,
  ];
  if (emotionHint) systemPromptParts.push(emotionHint);
  if (dailyStateHint) systemPromptParts.push(dailyStateHint);
  const systemPrompt = systemPromptParts.join("\n\n");

  const history: LLMMessage[] = session.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-12)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  history.push({ role: "user", content: buildCallEndedTrigger(clampedDuration) });

  let structured;
  try {
    structured = await generateStructuredReply(systemPrompt, history);
  } catch (err) {
    return NextResponse.json(
      { sessionId: session.id, callEndedMessage, error: err instanceof Error ? err.message : "LLM 호출 실패" },
      { status: 200 }
    );
  }

  let replyMessage: ChatMessage | null = null;
  if (structured.message && structured.event?.type !== "deleted_message") {
    replyMessage = {
      role: "assistant",
      content: structured.message,
      timestamp: Date.now(),
      eventType: structured.event?.type === "call_request" ? "call_request" : null,
    };
    await appendMessage(session.id, replyMessage);
  }

  const replyEventType = replyMessage?.eventType ?? null;
  const milestones = milestonesFromTurn({
    emotion: structured.emotion,
    eventType: replyEventType,
    assistantMessage: structured.message,
  });
  await Promise.all(milestones.map((milestone) => appendRelationshipMilestone(session.id, milestone)));

  if (structured.memory) {
    await appendMemory(
      session.id,
      structured.memory,
      inferMemoryType({ emotion: structured.emotion, eventType: replyEventType, memory: structured.memory })
    );
  }

  const relationshipScore = Math.max(0, Math.min(100, session.relationshipScore + structured.relationshipDelta));
  const relationshipStage = stageForScore(relationshipScore);
  await updateSession(session.id, {
    relationshipScore,
    relationshipStage,
    emotion: structured.emotion,
    emotionIntensity: structured.intensity,
    lastConversationMood: conversationMoodFromEmotion(structured.emotion),
    lastActiveAt: Date.now(),
  });

  return NextResponse.json({
    sessionId: session.id,
    characterName: session.characterName,
    personaType: session.personaType,
    callEndedMessage,
    replyMessage,
    mood: mood.state,
    relationshipStage,
    devMode,
  });
}
