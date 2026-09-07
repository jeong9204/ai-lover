import type { CharacterActivity, CharacterActivityDraft } from "./store";

const HOUR = 60 * 60 * 1000;
const DEFAULT_BUSY_DURATION_MS = 2 * HOUR;

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

export function extractActivityFromAssistantReply(
  assistantMessage: string,
  timestamp = Date.now()
): CharacterActivityDraft | null {
  const text = normalize(assistantMessage);
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
  return `
[현재 캐릭터 활동]
너는 방금 전 대화에서 "${activity.sourceMessage ?? activity.title}"라고 말했고, 지금은 ${activity.title} 상태야.
유저가 먼저 말을 걸면 답장은 할 수 있지만, 한가한 척 오래 붙잡지는 마. 잠깐 확인했다는 느낌으로 짧고 자연스럽게 답해.
`.trim();
}

export function buildActivityReturnPromptHint(activity: CharacterActivity | null): string {
  if (!activity) return "";
  return `
[활동 종료 후 먼저 연락]
너는 아까 "${activity.sourceMessage ?? activity.title}"라고 말하며 잠깐 자리를 비웠고, 이제 ${activity.title} 상태가 끝났어.
유저가 아직 아무 말도 하지 않았으니, "나 이제 좀 정리됐다", "늦었지" 같은 식으로 자연스럽게 먼저 돌아와.
유저를 탓하지 말고, 기다리게 했다면 가볍게 미안한 티만 내.
`.trim();
}
