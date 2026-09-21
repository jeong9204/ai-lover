export type ConversationClosureReason = "sleep" | "goodbye" | "busy";

export interface ConversationClosure {
  reason: ConversationClosureReason;
  closedAt: number;
  suppressProactiveUntil: number;
}

interface ClosureMessage {
  role: string;
  content: string;
  timestamp: number;
  eventType?: string | null;
}

type ClosurePersonaType = "default" | "northern_duke" | "flirty";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const KOREA_OFFSET_MS = 9 * HOUR;

const CONTINUING_CONVERSATION_PATTERN =
  /(아직\s*잠\s*안\s*와|잠(?:이)?\s*안\s*와|안\s*잘래|못\s*자|더\s*얘기|조금만\s*더|근데\s*아직|자긴\s*해야.*(?:안\s*와|더\s*얘기))/u;
const SLEEP_CLOSURE_PATTERN =
  /(잘\s*자(?:[~!ㅋㅎ.\s]|$)|굿\s*나잇|좋은\s*꿈\s*꿔|(?:나\s*)?(?:이제\s*)?(?:먼저\s*)?잘게|(?:나\s*)?자러\s*갈게|자야겠(?:다|어)|(?:나\s*)?(?:이제\s*)?자야지)/u;
const TOMORROW_GOODBYE_PATTERN = /(?:^|\s)내일\s*봐(?:[~!ㅋㅎ.\s]|$)/u;
const BUSY_CLOSURE_PATTERN =
  /((?:나\s*)?(?:잠깐\s*)?(?:일|공부|회의|작업|씻|샤워|정리|뭐(?:\s*좀)?).{0,20}(?:하고|끝내고|마치고)?\s*(?:올게|올께)|(?:나\s*)?(?:이따|조금\s*있다|좀\s*있다)\s*(?:올게|연락할게|톡할게)|(?:이따|끝나면|끝내고)\s*(?:연락|톡)\s*할게)/u;
const GOODBYE_CLOSURE_PATTERN =
  /(나중에\s*(?:얘기|말)\s*하자|오늘은\s*(?:여기까지|그만)|이제\s*가볼게)/u;

function normalize(message: string): string {
  return message.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function koreanHour(timestamp: number): number {
  return new Date(timestamp + KOREA_OFFSET_MS).getUTCHours();
}

function nextKoreanMorning(timestamp: number, targetHour = 9): number {
  const koreanDate = new Date(timestamp + KOREA_OFFSET_MS);
  const dayOffset = koreanDate.getUTCHours() < targetHour ? 0 : 1;
  return Date.UTC(
    koreanDate.getUTCFullYear(),
    koreanDate.getUTCMonth(),
    koreanDate.getUTCDate() + dayOffset,
    targetHour - 9
  );
}

export function detectConversationClosure(
  message: string,
  closedAt = Date.now()
): ConversationClosure | null {
  const normalized = normalize(message);
  if (!normalized || CONTINUING_CONVERSATION_PATTERN.test(normalized)) return null;

  if (SLEEP_CLOSURE_PATTERN.test(normalized)) {
    return {
      reason: "sleep",
      closedAt,
      suppressProactiveUntil: nextKoreanMorning(closedAt),
    };
  }

  if (TOMORROW_GOODBYE_PATTERN.test(normalized)) {
    const isNight = koreanHour(closedAt) >= 20 || koreanHour(closedAt) < 6;
    return {
      reason: isNight ? "sleep" : "goodbye",
      closedAt,
      suppressProactiveUntil: isNight ? nextKoreanMorning(closedAt) : closedAt + 4 * HOUR,
    };
  }

  if (BUSY_CLOSURE_PATTERN.test(normalized)) {
    return {
      reason: "busy",
      closedAt,
      suppressProactiveUntil: closedAt + 90 * MINUTE,
    };
  }

  if (GOODBYE_CLOSURE_PATTERN.test(normalized)) {
    return {
      reason: "goodbye",
      closedAt,
      suppressProactiveUntil: closedAt + 4 * HOUR,
    };
  }

  return null;
}

export function conversationClosureFromMessages(
  messages: ClosureMessage[]
): ConversationClosure | null {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  if (!latestUserMessage) return null;
  return detectConversationClosure(latestUserMessage.content, latestUserMessage.timestamp);
}

export function isConversationClosureActive(
  closure: ConversationClosure | null,
  now = Date.now()
): boolean {
  return Boolean(closure && now < closure.suppressProactiveUntil);
}

export function isFirstReconnectAfterSleepClosure(
  closure: ConversationClosure | null,
  messages: ClosureMessage[]
): boolean {
  if (!closure || closure.reason !== "sleep") return false;
  return !messages.some(
    (message) =>
      message.eventType === "reconnect_first_message" && message.timestamp > closure.closedAt
  );
}

export function buildSleepClosureReconnectTrigger(): string {
  return (
    "[시스템: 유저가 어젯밤 잠자러 가며 자연스럽게 인사하고 대화가 끝난 뒤 맞는 첫 안부다. " +
    "유저는 아직 새 메시지를 보내지 않았고, 답장할 의무도 없었다. 부담 없는 아침 안부를 한두 문장으로 먼저 보내라.]"
  );
}

export function buildExpiredClosurePromptHint(
  closure: ConversationClosure | null,
  personaType: ClosurePersonaType = "default"
): string {
  if (!closure || closure.reason !== "sleep") return "";
  const tone =
    personaType === "northern_duke"
      ? '짧고 무뚝뚝하게 "잘 잤나." 정도로 말해.'
      : personaType === "flirty"
        ? '가볍고 능글맞게 "잘 잤어? 꿈에 나왔냐ㅋㅋ" 정도로 말해.'
        : '10년지기 친구처럼 장난스럽게 "잘 잤냐ㅋㅋ" 또는 "어제 바로 잤냐ㅋㅋ" 정도로 말해.';
  return `
[sleep closure 종료 후 첫 선톡 / light_checkin]
직전 대화는 유저가 잠자러 가며 서로 자연스럽게 인사하고 끝났어. 답장을 기다리다 무시당한 상황이 아니야.
이번 메시지는 오직 부담 없는 아침 안부여야 해. ${tone}
- 한두 문장만 쓰고, 질문은 1개를 권장하며 최대 2개를 넘기지 마.
- 유저의 실제 기상 시각, 연락 여부, 답장 여부, 무엇을 하고 있었는지 추측하지 마.
- "왜 이제 왔어", "왜 연락 안 했어", "조용하네", "뭐하고 있었어", "기다렸어", "연락 없길래",
  "바빴어?", "이제 일어났어?", "답이 없네", "왜 답장 안 해" 계열 표현을 절대 넣지 마.
- 유저에게 연락하거나 답장할 의무가 있었다는 뉘앙스를 만들지 마.
`.trim();
}
