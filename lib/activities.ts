import type { CharacterActivity, CharacterActivityDraft } from "./store";

const HOUR = 60 * 60 * 1000;
const DEFAULT_BUSY_DURATION_MS = 2 * HOUR;
const MINUTE = 60 * 1000;
const DEFAULT_SCHEDULED_CALL_DELAY_MS = 5 * MINUTE;
const MAX_SCHEDULED_CALL_DELAY_MS = 60 * MINUTE;

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(text: string, max = 120): string {
  const normalized = normalize(text);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
}

function looksLikeBusyWorkClosure(text: string): boolean {
  return (
    /(일|회사|업무|회의|작업|근무|마감).*(끝나|끝내|마치|정리).*(연락|올게|올께|카톡|말할게)/u.test(text) ||
    /(이따|조금\s*있다|좀\s*있다).*(연락할게|연락할께|올게|올께|말할게)/u.test(text) ||
    /(조금만|좀만).*(기다려|기다려줘)/u.test(text)
  );
}

function scheduledCallDelayMs(text: string): number | null {
  if (!/(전화|통화|폰).*(걸|할|하자|받|들고|들어)|(?:걸|전화|통화).*(폰|전화|통화)/u.test(text)) {
    return null;
  }

  const minuteMatch = text.match(/(\d{1,2})\s*분/u);
  if (minuteMatch) {
    const minutes = Number(minuteMatch[1]);
    if (Number.isFinite(minutes) && minutes > 0) {
      return Math.min(minutes * MINUTE, MAX_SCHEDULED_CALL_DELAY_MS);
    }
  }

  if (/(금방|곧|잠깐만|조금만|씻고|나오면|나와서|도착하면)/u.test(text)) {
    return DEFAULT_SCHEDULED_CALL_DELAY_MS;
  }

  return null;
}

export function extractActivityFromAssistantReply(
  assistantMessage: string,
  timestamp = Date.now()
): CharacterActivityDraft | null {
  const text = normalize(assistantMessage);
  const callDelayMs = scheduledCallDelayMs(text);
  if (callDelayMs) {
    return {
      type: "scheduled_call",
      title: "전화 걸 준비 중",
      detail: "조금 뒤 먼저 전화하려는 중",
      startsAt: timestamp,
      endsAt: timestamp + callDelayMs,
      sourceMessage: compact(text),
    };
  }

  if (!looksLikeBusyWorkClosure(text)) return null;

  return {
    type: "busy_work",
    title: "일하는 중",
    detail: "일 끝나고 다시 연락하려는 중",
    startsAt: timestamp,
    endsAt: timestamp + DEFAULT_BUSY_DURATION_MS,
    sourceMessage: compact(text),
  };
}

export function currentActivity(activities: CharacterActivity[], now = Date.now()): CharacterActivity | null {
  return activities.find((activity) => activity.status === "active" && activity.endsAt > now) ?? null;
}

export function expiredReturnActivity(activities: CharacterActivity[], now = Date.now()): CharacterActivity | null {
  return activities.find((activity) => activity.status === "active" && activity.endsAt <= now) ?? null;
}

export function buildActivityPromptHint(activity: CharacterActivity | null): string {
  if (!activity) return "";
  if (activity.type === "scheduled_call") {
    return `
[현재 캐릭터 활동]
너는 방금 전 대화에서 "${activity.sourceMessage ?? activity.title}"라고 말했고, 지금은 전화할 준비를 하는 중이야.
유저가 먼저 말을 걸면 답장은 할 수 있지만, 아직 통화가 시작된 척하지 말고 곧 전화하겠다는 흐름을 유지해.
`.trim();
  }

  return `
[현재 캐릭터 활동]
너는 방금 전 대화에서 "${activity.sourceMessage ?? activity.title}"라고 말했고, 지금은 ${activity.title} 상태야.
유저가 먼저 말을 걸면 답장은 할 수 있지만, 한가한 척 오래 붙잡지는 마. 잠깐 확인했다는 느낌으로 짧고 자연스럽게 답해.
`.trim();
}

export function expiredScheduledCall(activities: CharacterActivity[], now = Date.now()): CharacterActivity | null {
  return (
    activities.find(
      (activity) => activity.type === "scheduled_call" && activity.status === "active" && activity.endsAt <= now
    ) ?? null
  );
}

export function buildScheduledCallMessage(activity: CharacterActivity): string {
  const source = activity.sourceMessage ? `아까 ${activity.sourceMessage.includes("전화") ? "전화한다고" : "말한 거"} ` : "";
  return `${source}기다렸지? 나 지금 전화 걸게.`;
}

export function buildActivityReturnPromptHint(activity: CharacterActivity | null): string {
  if (!activity) return "";
  return `
[활동 종료 후 먼저 연락]
너는 아까 "${activity.sourceMessage ?? activity.title}"라고 말하며 잠깐 자리를 비웠고, 이제 ${activity.title} 상태가 끝났어.
유저가 아직 새로 말을 건 게 아니라, 네가 먼저 돌아와 답장하는 상황이야.
"왔네?", "왔어?", "일 끝났어?"처럼 유저가 돌아온 것처럼 말하지 마.
"나 이제 좀 정리됐다", "늦었지", "기다렸지" 같은 식으로 네가 일을 끝내고 돌아온 말투로 이어가.
유저를 탓하지 말고, 기다리게 했다면 가볍게 미안한 티만 내.
`.trim();
}

export function buildActivityReturnTrigger(activity: CharacterActivity): string {
  return (
    `[시스템: 네가 아까 "${activity.sourceMessage ?? activity.title}"라고 말하며 잠깐 자리를 비웠고, ` +
    `이제 네 일이 끝나서 유저에게 먼저 답장한다. 유저가 방금 새 메시지를 보낸 것이 아니다. ` +
    `"왔네?", "일 끝났어?"처럼 유저가 돌아왔거나 유저 일을 묻는 말로 시작하지 말고, ` +
    `네가 돌아왔다는 내용으로 짧게 이어라.]`
  );
}
