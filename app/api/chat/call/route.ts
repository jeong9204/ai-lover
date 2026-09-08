// 통화 종료 처리 — 실제 음성 통화가 아니라 프런트에서 시뮬레이션한 "전화 화면"이 끝난 뒤
// 호출된다. 통화 시간을 구분선으로 남기고, 통화가 막 끝난 여운이 묻어나는 후속 대사를
// generateStructuredReply()로 한 번 더 생성한다 (reconnect의 "먼저 말 걸기"와 같은 패턴).

import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateSession,
  appendMessage,
  updateSession,
  countMessagesToday,
  getDailyMessageLimit,
  getFeedbackBonusCountToday,
  ChatMessage,
  getOrCreateCharacterDailyState,
  appendRelationshipMilestone,
  appendMemory,
  appendActivity,
} from "@/lib/store";
import { computeMood } from "@/lib/mood";
import { buildEmotionPromptHint } from "@/lib/jealousy";
import { PERSONA_BASE, buildCharacterNameHint, buildUserNameHint } from "@/lib/persona";
import { generateStructuredReply, STRUCTURED_OUTPUT_GUIDE, LLMMessage } from "@/lib/llm";
import { stageForScore, conversationMoodFromEmotion, Emotion, CONFESSED_STAGE } from "@/lib/schema";
import { buildCallEndedLabel, buildCallEndedTrigger } from "@/lib/events";
import { buildDailyStatePromptHint } from "@/lib/daily-state";
import { inferMemoryType, milestonesFromTurn } from "@/lib/milestones";
import { isDeveloperRequest } from "@/lib/dev-mode";
import { buildConversationSummaryHint, buildEventHistory } from "@/lib/llm-context";
import { buildCurrentTimePromptHint } from "@/lib/time-context";
import { buildActivityPromptHint, currentActivity, extractActivityFromAssistantReply } from "@/lib/activities";
import { checkLLMRateLimit } from "@/lib/rate-limit";

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
  const { durationSec, endedBy = "user" } = (await req.json()) as {
    durationSec?: number;
    endedBy?: "user" | "assistant";
  };
  if (typeof durationSec !== "number" || !Number.isFinite(durationSec) || durationSec < 0) {
    return NextResponse.json({ error: "durationSec이 필요합니다." }, { status: 400 });
  }
  const clampedDuration = Math.min(Math.round(durationSec), MAX_DURATION_SEC);
  const callEndedBy = endedBy === "assistant" ? "assistant" : "user";

  const result = await getOrCreateSession(req.headers.get("x-session-id"));
  if (result.status === "error") {
    return NextResponse.json({ error: SESSION_LOAD_ERROR }, { status: 503 });
  }
  const { session } = result;

  const devMode = isDeveloperRequest(req);
  const [messageCountBeforeCall, dailyMessageLimit] = await Promise.all([
    countMessagesToday(session.id),
    getDailyMessageLimit(session.id),
  ]);
  const now = Date.now();
  const callEndedMessage: ChatMessage = {
    role: "system_event",
    content: buildCallEndedLabel(clampedDuration, callEndedBy),
    timestamp: now,
    eventType: "call_ended",
    metadata: { callEndedBy },
  };
  if (!devMode && messageCountBeforeCall >= dailyMessageLimit) {
    const feedbackBonusCount = await getFeedbackBonusCountToday(session.id);
    const canRequestFeedbackBonus = feedbackBonusCount === 0;
    const limitMessage: ChatMessage = {
      role: "system_event",
      content: "오늘은 이 통화로 마무리할게요. 내일 다시 이어서 이야기해요.",
      timestamp: now + 1,
      eventType: "limit_reached",
      metadata: { limitBlocked: true },
    };
    await appendMessage(session.id, callEndedMessage);
    await appendMessage(session.id, limitMessage);
    await appendRelationshipMilestone(
      session.id,
      milestonesFromTurn({ emotion: session.emotion as Emotion, eventType: "call_ended", durationSec: clampedDuration })[0]
    );
    await updateSession(session.id, {
      lastActiveAt: now,
    });
    return NextResponse.json(
      {
        callEndedMessage,
        limitMessage,
        canRequestFeedbackBonus,
        dailyMessageCount: messageCountBeforeCall,
        dailyMessageLimit,
        devMode,
      },
      { status: 200 }
    );
  }

  if (!devMode) {
    const rateLimitResponse = await checkLLMRateLimit(req, session.id);
    if (rateLimitResponse) return rateLimitResponse;
  }

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
  const dailyState = await getOrCreateCharacterDailyState(session.id);
  const dailyStateHint = buildDailyStatePromptHint(dailyState);
  const systemPromptParts = [
    PERSONA_BASE,
    buildCharacterNameHint(session.characterName, session.personaType),
    buildUserNameHint(session.userName),
    buildCurrentTimePromptHint(),
    `[현재 감정 상태 힌트]\n${mood.promptHint}`,
    STRUCTURED_OUTPUT_GUIDE,
  ];
  if (emotionHint) systemPromptParts.push(emotionHint);
  if (dailyStateHint) systemPromptParts.push(dailyStateHint);
  const activityHint = buildActivityPromptHint(currentActivity(session.activities));
  if (activityHint) systemPromptParts.push(activityHint);
  const conversationSummaryHint = buildConversationSummaryHint(session.messages);
  if (conversationSummaryHint) systemPromptParts.push(conversationSummaryHint);
  const systemPrompt = systemPromptParts.join("\n\n");

  const history: LLMMessage[] = buildEventHistory(session.messages, buildCallEndedTrigger(clampedDuration, callEndedBy));

  let structured;
  try {
    structured = await generateStructuredReply(systemPrompt, history, { maxTokens: 360 });
  } catch (err) {
    return NextResponse.json(
      {
        sessionId: session.id,
        callEndedMessage,
        error: err instanceof Error ? err.message : "LLM 호출 실패",
        dailyMessageCount: await countMessagesToday(session.id),
        dailyMessageLimit: await getDailyMessageLimit(session.id),
      },
      { status: 200 }
    );
  }

  let replyMessage: ChatMessage | null = null;
  if (structured.message && structured.event?.type !== "deleted_message") {
    replyMessage = {
      role: "assistant",
      content: structured.message,
      timestamp: now + 1,
      eventType: structured.event?.type === "call_request" ? "call_request" : null,
      usage: structured.usage,
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
  const activity =
    replyEventType === "call_request" ? null : extractActivityFromAssistantReply(structured.message, now + 1);
  await appendActivity(session.id, activity);
  const responseActivities = activity
    ? [
        ...session.activities,
        {
          id: `activity-${now}`,
          type: activity.type,
          title: activity.title,
          detail: activity.detail ?? null,
          status: "active" as const,
          startsAt: activity.startsAt,
          endsAt: activity.endsAt,
          sourceMessage: activity.sourceMessage ?? null,
          createdAt: now,
        },
      ]
    : session.activities;

  const relationshipScore = Math.max(0, Math.min(100, session.relationshipScore + structured.relationshipDelta));
  const relationshipStage = session.confessedAt ? CONFESSED_STAGE : stageForScore(relationshipScore);
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
    emotion: structured.emotion,
    emotionIntensity: structured.intensity,
    relationshipStage,
    devMode,
    dailyState,
    commitments: session.commitments,
    activities: responseActivities,
    dailyMessageCount: await countMessagesToday(session.id),
    dailyMessageLimit: await getDailyMessageLimit(session.id),
  });
}
