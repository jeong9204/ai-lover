import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateSession,
  appendMessage,
  appendMemory,
  updateSession,
  countMessagesToday,
  DAILY_MESSAGE_LIMIT,
  ChatMessage,
} from "@/lib/store";
import { computeMood, PresenceContext } from "@/lib/mood";
import { detectJealousyTrigger, JEALOUSY_PROMPT_HINT, buildEmotionPromptHint } from "@/lib/jealousy";
import { pickRelevantMemories, buildMemoryPromptHint } from "@/lib/memory";
import { PERSONA_BASE, buildUserNameHint, isLaughterOnlyMessage, buildLaughterOnlyHint } from "@/lib/persona";
import { generateStructuredReply, STRUCTURED_OUTPUT_GUIDE, LLMMessage } from "@/lib/llm";
import { stageForScore, conversationMoodFromEmotion, Emotion } from "@/lib/schema";
import { recentDeletedMessageHint } from "@/lib/events";
import { attemptReconnect } from "@/lib/reconnect";

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
    const extraMessages: ChatMessage[] = [reconnect?.timeSkipMessage, reconnect?.reconnectMessage].filter(
      (m): m is ChatMessage => m != null
    );

    return NextResponse.json({
      sessionId: session.id,
      messages: [...session.messages, ...extraMessages],
      mood: reconnect?.mood ?? mood.state,
      relationshipStage: reconnect?.relationshipStage ?? session.relationshipStage,
      userName: session.userName,
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

  if ((await countMessagesToday(session.id)) >= DAILY_MESSAGE_LIMIT) {
    return NextResponse.json(
      { error: "오늘 대화 횟수를 다 썼어요. 내일 다시 이야기해요!" },
      { status: 429 }
    );
  }

  const mood = computeMood(session.lastMessageAt, presenceContext(session));
  const isJealous = detectJealousyTrigger(message); // 보조 신호 — 최종 감정 판단은 LLM의 emotion/intensity가 담당
  const relevantMemories = pickRelevantMemories(session.memories, message);

  const lastMsg = session.messages[session.messages.length - 1];
  const hadRecentDeletedMessage = lastMsg?.role === "system_event" && lastMsg.eventType === "deleted_message";

  const systemPromptParts = [
    PERSONA_BASE,
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
  if (isJealous) systemPromptParts.push(`[참고 신호]\n${JEALOUSY_PROMPT_HINT}`);
  const memoryHint = buildMemoryPromptHint(relevantMemories);
  if (memoryHint) systemPromptParts.push(`[기억]\n${memoryHint}`);

  const systemPrompt = systemPromptParts.join("\n\n");

  const history: LLMMessage[] = session.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-12)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  history.push({ role: "user", content: message });

  let structured;
  try {
    structured = await generateStructuredReply(systemPrompt, history);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "LLM 호출 실패" },
      { status: 500 }
    );
  }

  const now = Date.now();
  await appendMessage(session.id, { role: "user", content: message, timestamp: now });

  if (structured.event?.type === "deleted_message") {
    await appendMessage(session.id, {
      role: "system_event",
      content: "메시지를 삭제했습니다.",
      timestamp: now,
      eventType: "deleted_message",
    });
  } else if (structured.message) {
    await appendMessage(session.id, {
      role: "assistant",
      content: structured.message,
      timestamp: now,
      eventType: structured.event?.type === "call_request" ? "call_request" : null,
    });
  }

  const relationshipScore = Math.max(0, Math.min(100, session.relationshipScore + structured.relationshipDelta));
  const relationshipStage = stageForScore(relationshipScore);
  await updateSession(session.id, {
    relationshipScore,
    relationshipStage,
    emotion: structured.emotion,
    emotionIntensity: structured.intensity,
    lastConversationMood: conversationMoodFromEmotion(structured.emotion),
    lastActiveAt: now,
  });

  if (structured.memory) {
    await appendMemory(session.id, structured.memory);
  }

  return NextResponse.json({
    sessionId: session.id,
    reply: structured.message,
    event: structured.event,
    mood: mood.state,
    relationshipStage,
    isJealous,
  });
}
