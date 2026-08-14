// "재접속 시 먼저 말 걸기" 오케스트레이션. 원래 app/api/chat/route.ts의 GET 핸들러 안에 있던
// 로직을 그대로 추출했다 — 유저가 직접 탭을 다시 열었을 때(GET)뿐 아니라, 백그라운드 cron이
// "이 세션 지금 먼저 말 걸어야 하나?"를 확인할 때도 같은 로직을 재사용하기 위해서다.

import { computeMood, MoodState } from "./mood";
import { buildEmotionPromptHint } from "./jealousy";
import { PERSONA_BASE, buildUserNameHint } from "./persona";
import { generateStructuredReply, STRUCTURED_OUTPUT_GUIDE, LLMMessage } from "./llm";
import { stageForScore, conversationMoodFromEmotion, Emotion } from "./schema";
import { buildTimeSkipCard, shouldSendReconnectMessage, buildReconnectTrigger } from "./events";
import { appendMessage, updateSession, claimReconnectSlot, ChatMessage, SessionData } from "./store";

export interface ReconnectResult {
  timeSkipMessage: ChatMessage | null;
  reconnectMessage: ChatMessage | null;
  mood: MoodState;
  relationshipStage: string;
}

/**
 * 세션의 Presence 상태를 확인해서, 필요하면 time_skip 구분선과 캐릭터의 먼저 말걸기 메시지를
 * 생성/저장한다. 아무것도 할 게 없으면(방금 대화했거나 mood가 calm이면) null을 반환한다.
 */
export async function attemptReconnect(session: SessionData): Promise<ReconnectResult | null> {
  const hasHistory = session.messages.length > 0;
  if (!hasHistory) return null;

  const mood = computeMood(session.lastMessageAt, {
    lastConversationMood: session.lastConversationMood,
    relationshipStage: session.relationshipStage,
  });

  // 표시할 게 실제로 있는지 먼저 판단한다. claimReconnectSlot은 last_active_at을 "지금"으로
  // 갱신하는데, 이걸 매 폴링마다 무조건 호출하면 탭을 열어두고 자리를 비운 사이에도 경과 시간이
  // 계속 리셋돼버려서 아래 두 이벤트가 영영 발생할 기회를 못 얻는다 — 그래서 claim 전에 먼저
  // "지금 보여줄 게 있는가"를 확정하고, 있을 때만 선점을 시도한다.
  const timeSkipLabel = buildTimeSkipCard(mood.elapsedMs);
  const wantsReconnectMessage = shouldSendReconnectMessage(mood.state);
  if (!timeSkipLabel && !wantsReconnectMessage) return null;

  // 동시에 여러 요청이 이 세션을 확인하더라도(개발 모드의 이중 마운트, 탭 폴링과 새로고침이
  // 겹치는 경우 등) 한 번만 처리되도록 선점한다. 실패하면 이미 누군가 처리 중/처리 완료.
  const claimed = await claimReconnectSlot(session.id);
  if (!claimed) return null;

  let timeSkipMessage: ChatMessage | null = null;
  if (timeSkipLabel) {
    timeSkipMessage = {
      role: "system_event",
      content: timeSkipLabel,
      timestamp: Date.now(),
      eventType: "time_skip",
    };
    await appendMessage(session.id, timeSkipMessage);
  }

  let reconnectMessage: ChatMessage | null = null;
  let relationshipStage = session.relationshipStage;

  if (wantsReconnectMessage) {
    const emotionHint = buildEmotionPromptHint(session.emotion as Emotion, session.emotionIntensity);
    const systemPromptParts = [
      PERSONA_BASE,
      buildUserNameHint(session.userName),
      `[현재 감정 상태 힌트]\n${mood.promptHint}`,
      STRUCTURED_OUTPUT_GUIDE,
    ];
    if (emotionHint) systemPromptParts.push(emotionHint);
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
  }

  if (!timeSkipMessage && !reconnectMessage) return null;
  return { timeSkipMessage, reconnectMessage, mood: mood.state, relationshipStage };
}
