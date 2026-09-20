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
}

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

export function buildExpiredClosurePromptHint(closure: ConversationClosure | null): string {
  if (!closure || closure.reason !== "sleep") return "";
  return `
[이전 대화 종료]
직전 대화는 유저가 잠자러 가며 서로 자연스럽게 인사하고 끝났어. 답장을 기다리다 무시당한 상황이 아니야.
다시 먼저 말을 걸게 되면 "왜 이제 왔어", "기다렸잖아"처럼 죄책감을 주지 말고,
"잘 잤냐", "일어났어?", "어제 바로 잤냐ㅋㅋ"처럼 새 아침의 가벼운 안부로 시작해.
`.trim();
}
