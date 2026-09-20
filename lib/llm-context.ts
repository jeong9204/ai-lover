import type { ChatMessage } from "./store";
import type { LLMMessage } from "./llm";
import { isDifferentKoreanDay, koreanDateLabel } from "./korean-date";

const CHAT_HISTORY_LIMIT = 8;
const EVENT_HISTORY_LIMIT = 6;
const MAX_HISTORY_CONTENT_CHARS = 500;
const SUMMARY_LOOKBACK_LIMIT = 30;
const SUMMARY_ITEM_CHARS = 80;
const WORK_LOOP_LOOKBACK_LIMIT = 16;

function compactContent(content: string): string {
  const normalized = content.trim();
  if (normalized.length <= MAX_HISTORY_CONTENT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_HISTORY_CONTENT_CHARS)}...`;
}

function compactSummaryItem(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= SUMMARY_ITEM_CHARS) return normalized;
  return `${normalized.slice(0, SUMMARY_ITEM_CHARS)}...`;
}

function roleLabel(role: ChatMessage["role"]): string {
  if (role === "user") return "유저";
  if (role === "assistant") return "캐릭터";
  return "이벤트";
}

function isStaleLimitBlockedMessage(message: ChatMessage, now = Date.now()): boolean {
  return message.metadata?.limitBlocked === true && isDifferentKoreanDay(message.timestamp, now);
}

export function messagesAfterLatestMeetupCompletion(messages: ChatMessage[]): ChatMessage[] {
  let completedIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.eventType === "meetup_completed") {
      completedIndex = index;
      break;
    }
  }
  return completedIndex >= 0 ? messages.slice(completedIndex) : messages;
}

export function buildChatHistory(messages: ChatMessage[], nextUserMessage: string): LLMMessage[] {
  const history = messagesAfterLatestMeetupCompletion(messages)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-CHAT_HISTORY_LIMIT)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: compactContent(m.content),
    }));

  history.push({ role: "user", content: compactContent(nextUserMessage) });
  return history;
}

export function buildEventHistory(messages: ChatMessage[], trigger: string): LLMMessage[] {
  const history = messagesAfterLatestMeetupCompletion(messages)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => !isStaleLimitBlockedMessage(m))
    .slice(-EVENT_HISTORY_LIMIT)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: compactContent(m.content),
    }));

  history.push({ role: "user", content: compactContent(trigger) });
  return history;
}

export function buildConversationSummaryHint(messages: ChatMessage[]): string | null {
  const recent = messagesAfterLatestMeetupCompletion(messages).slice(-SUMMARY_LOOKBACK_LIMIT);
  if (recent.length < 10) return null;

  const conversational = recent.filter((m) => m.role === "user" || m.role === "assistant");
  const recentUserMessages = conversational
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => compactSummaryItem(m.content));
  const recentAssistantMessages = conversational
    .filter((m) => m.role === "assistant")
    .slice(-2)
    .map((m) => compactSummaryItem(m.content));
  const recentEvents = recent
    .filter((m) => m.role === "system_event" || m.eventType)
    .slice(-2)
    .map((m) => `${roleLabel(m.role)}: ${compactSummaryItem(m.content)}`);

  const lines = [
    recentUserMessages.length > 0 ? `유저가 최근 꺼낸 말: ${recentUserMessages.join(" / ")}` : null,
    recentAssistantMessages.length > 0 ? `캐릭터의 최근 반응: ${recentAssistantMessages.join(" / ")}` : null,
    recentEvents.length > 0 ? `최근 있었던 일: ${recentEvents.join(" / ")}` : null,
  ].filter(Boolean);

  if (lines.length === 0) return null;
  return `
[최근 대화 요약]
아래는 전체 대화 기록을 다시 보내지 않기 위한 짧은 요약이야. 바로 직전 메시지 흐름을 우선하되,
분위기와 이어지는 맥락이 필요할 때만 참고해.
요약에 적힌 유저 문장은 이미 지나간 말이야. 마지막 user 메시지가 다시 꺼내지 않았다면 그대로 인용하거나
새 질문처럼 답하지 마.
요약에 반복해서 등장한 소재를 그대로 되풀이하지 말고, 이미 충분히 다룬 화제라면 짧게 받아준 뒤
다른 감정/상황/생활 디테일로 자연스럽게 움직여:
${lines.map((line) => `- ${line}`).join("\n")}
`.trim();
}

export function buildCurrentTurnPriorityHint(userMessage: string): string {
  const normalized = userMessage.replace(/\s+/g, " ").trim();
  const hasExplicitSleepIntent =
    /(너무\s*)?(졸려|잠\s*와|잠이\s*와|자야겠|자야\s*돼|자러\s*갈|이제\s*잘게|먼저\s*잘게|잘\s*거야)/u.test(
      normalized
    );
  const wantsToKeepTalking =
    /(잠\s*안\s*와|잠이\s*안\s*와|더\s*얘기|조금만\s*더|계속\s*얘기|말동무|안\s*잘래)/u.test(
      normalized
    );
  const hasTopicShift = /(^|\s)(근데|그런데|아무튼|갑자기|그러고\s*보니|아\s*맞다|요즘)(\s|$)/u.test(
    normalized
  );

  const lines = [
    "[현재 답변 우선순위]",
    "1. 마지막 user 메시지의 직접적인 의도와 현재 화제",
    "2. 바로 최근 몇 턴의 흐름",
    "3. 현재 감정과 관계 상태",
    "4. 현재 메시지와 관련 있는 미해결 소재/약속",
    "5. 오래된 memory와 요약",
    "현재 user 메시지와 관계없는 미해결 소재나 오래된 기억을 이번 답변에 억지로 연결하지 마.",
  ];

  if (!hasExplicitSleepIntent) {
    lines.push(
      "유저는 이번 메시지에서 취침 의사를 직접 밝히지 않았어. 시간이 늦다는 이유만으로 잠, 내일, 알람, 컨디션 이야기를 꺼내지 마."
    );
  }
  if (wantsToKeepTalking) {
    lines.push("유저가 계속 대화하고 싶다고 명확히 말했어. 잠을 권하지 말고 현재 대화를 이어가.");
  }
  if (hasTopicShift) {
    lines.push("유저가 새 화제로 전환했어. 직전 수면/약속/미해결 소재로 되돌리지 말고 새 화제에 먼저 답해.");
  }

  return lines.join("\n");
}

export function buildWorkLoopAvoidanceHint(messages: ChatMessage[]): string | null {
  const recentAssistantMessages = messages
    .filter((m) => m.role === "assistant")
    .slice(-WORK_LOOP_LOOKBACK_LIMIT)
    .map((m) => m.content.replace(/\s+/g, " ").trim());
  const workMentions = recentAssistantMessages.filter((content) =>
    /(회사|업무|퇴근|근무|회의|마감|일\s*(끝|해야|하러|하고|마치|정리)|바쁘|이따\s*(연락|톡)|끝나.*연락)/u.test(
      content
    )
  );

  if (workMentions.length < 2) return null;

  return `
[반복 소재 경고]
최근 네 답장에 회사/일/퇴근/바쁨/이따 연락 같은 흐름이 여러 번 나왔어.
이번 턴에는 유저가 직접 일 얘기를 묻지 않는 한, 회사나 업무를 새 근황/핑계/대화 종료로 쓰지 마.
대신 방금 유저 말에 먼저 반응하고, 필요하면 영화, 약속 준비, 산책, 음악, 날씨, 집에서의 작은 일,
장난, 보고 싶음 같은 다른 생활감으로 이어가.
`.trim();
}

export function buildDayBoundaryPromptHint(messages: ChatMessage[], now = Date.now()): string | null {
  const lastConversationMessage = [...messages].reverse().find((m) => m.role === "user" || m.role === "assistant");
  if (!lastConversationMessage || !isDifferentKoreanDay(lastConversationMessage.timestamp, now)) return null;

  const previousLabel = koreanDateLabel(lastConversationMessage.timestamp);
  const currentLabel = koreanDateLabel(now);
  const lastContent = compactSummaryItem(lastConversationMessage.content);
  const hadGoodnightContext = messages
    .slice(-6)
    .some((m) => /(잘\s*자|굿나잇|좋은\s*꿈|내일\s*봐|내일\s*카페|자기\s*전|졸려|잠들)/u.test(m.content));

  return `
[날짜 경계]
마지막 대화는 ${previousLabel}이고, 지금은 ${currentLabel}이야. 마지막으로 남은 말은 "${lastContent}"였어.
${hadGoodnightContext ? '어제 밤에 "잘 자", "내일 봐"처럼 마무리한 흐름이 있었어. ' : ""}
이번 턴에는 같은 밤이 계속되는 것처럼 "안 자고 뭐해", "갑자기 조용해져서 잠들었나"라고 말하지 마.
오늘 다시 시작된 대화로 받아들이고, 어제 약속/대화가 있으면 "오늘"의 일로 자연스럽게 이어가.
`.trim();
}

export function buildLimitResumePromptHint(messages: ChatMessage[]): string | null {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role !== "user" || lastMessage.metadata?.limitBlocked !== true) return null;
  if (isStaleLimitBlockedMessage(lastMessage)) return null;

  return `
[한도 종료 후 이어받기]
직전 유저 메시지는 이전 이용 한도 때문에 네가 아직 답하지 못한 말이야:
"${compactContent(lastMessage.content)}"
이번 턴에는 이 미해결 메시지를 먼저 자연스럽게 이어받고, 마지막 user 메시지가 추가로 있다면 같이 반영해.
한도, 시스템, 앱 같은 메타 이유를 캐릭터 입으로 설명하지 마.
`.trim();
}
