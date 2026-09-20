import type { ChatMessage, Commitment, CommitmentDraft } from "./store";

const DUE_PATTERNS = [
  "오늘",
  "내일",
  "모레",
  "이번 주",
  "다음 주",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
  "일요일",
];

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(text: string, max = 80): string {
  const normalized = normalize(text);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function detectDueLabel(text: string): string | null {
  return DUE_PATTERNS.find((word) => text.includes(word)) ?? null;
}

function detectOwner(role: ChatMessage["role"], text: string): CommitmentDraft["owner"] {
  if (role === "user" && /(네가|너가|너는|넌)/u.test(text)) return "assistant";
  if (role === "assistant" && /(네가|너가|너는|넌)/u.test(text)) return "user";
  if (role === "user" && /(내가|나는|난|나\s*는)/u.test(text)) return "user";
  if (role === "assistant" && /(내가|나는|난|나\s*는)/u.test(text)) return "assistant";
  return "shared";
}

function titleFor(text: string): string | null {
  if (includesAny(text, ["영화표", "표", "예매", "티켓"])) return "영화표 챙기기";
  if (includesAny(text, ["맛집", "밥집", "식당", "카페", "장소"])) return "갈 곳 찾아두기";
  if (includesAny(text, ["예약"])) return "예약 챙기기";
  if (includesAny(text, ["만나", "보자", "볼래", "데이트", "약속"])) return "만날 약속";
  if (includesAny(text, ["챙겨", "가져", "입고", "우산"])) return "챙길 것 확인";
  return null;
}

function isCommitmentLike(text: string): boolean {
  const hasPlanSubject = includesAny(text, [
    "영화표",
    "티켓",
    "예매",
    "예약",
    "맛집",
    "밥집",
    "식당",
    "카페",
    "장소",
    "만나",
    "보자",
    "약속",
    "챙겨",
    "가져",
  ]);
  const hasCommitmentVerb = includesAny(text, [
    "할게",
    "해둘게",
    "해놓을게",
    "잡을게",
    "잡아둘게",
    "잡았",
    "예매할",
    "예매했",
    "예약할",
    "예약했",
    "골라올",
    "골라와",
    "골라둘",
    "찾아올",
    "찾아와",
    "알아볼",
    "보낼게",
    "가자",
    "보자",
    "만나자",
  ]);
  return hasPlanSubject && hasCommitmentVerb;
}

const HYPOTHETICAL_MEETUP_PATTERN =
  /(만나면|보면|가면|먹으면|하면|한다면|할까\??|했으면\s*좋겠|하면\s*좋겠|만나고\s*싶|보고\s*싶)/u;
const DIRECT_MEETUP_CONFIRMATION_PATTERN =
  /(만나자|만날래|데이트\s*하자|데이트\s*할래|만나기로\s*(?:했|한)|(?:오늘|내일|모레|이번\s*주|다음\s*주|주말|[월화수목금토일]요일|그럼|그러면).{0,20}(?:보자|볼래)|(?:오늘|내일|모레|이번\s*주|다음\s*주|주말|[월화수목금토일]요일).{0,20}만나서)/u;
const MEETUP_PROPOSAL_PATTERN =
  /(만나|볼까|보자|볼래|데이트|같이.{0,16}(?:가자|먹자|보자)|만나면\s*좋겠|보고\s*싶)/u;
const MEETUP_ACCEPTANCE_PATTERN =
  /^(?:응+|어+|그래|좋아|좋지|오케이|오키|콜|그러자|그렇게\s*하자|약속)(?:[!~ㅋㅎ\s.]|$)/u;
const MEETUP_REJECTION_PATTERN =
  /(싫|안\s*돼|못\s*(봐|만나|가)|어려|힘들|다음에|나중에|농담|장난)/u;

export function isHypotheticalMeetupProposal(message: string): boolean {
  const text = normalize(message);
  return MEETUP_PROPOSAL_PATTERN.test(text) && HYPOTHETICAL_MEETUP_PATTERN.test(text);
}

function isDirectUserMeetupConfirmation(message: string): boolean {
  const text = normalize(message);
  if (!text || isHypotheticalMeetupProposal(text)) return false;
  return DIRECT_MEETUP_CONFIRMATION_PATTERN.test(text);
}

function latestAssistantMessage(messages: ChatMessage[]): string | null {
  return [...messages].reverse().find((message) => message.role === "assistant")?.content ?? null;
}

export function isUserConfirmedMeetup(input: {
  userMessage: string;
  recentMessages?: ChatMessage[];
}): boolean {
  const userMessage = normalize(input.userMessage);
  if (isDirectUserMeetupConfirmation(userMessage)) return true;
  if (!MEETUP_ACCEPTANCE_PATTERN.test(userMessage) || MEETUP_REJECTION_PATTERN.test(userMessage)) {
    return false;
  }

  const priorAssistant = latestAssistantMessage(input.recentMessages ?? []);
  return Boolean(priorAssistant && MEETUP_PROPOSAL_PATTERN.test(normalize(priorAssistant)));
}

const MEETUP_COMMITMENT_TITLES = new Set([
  "만날 약속",
  "갈 곳 찾아두기",
  "영화표 챙기기",
  "예약 챙기기",
  "챙길 것 확인",
]);

function kstDayIndex(timestamp: number): number {
  return Math.floor((timestamp + 9 * 60 * 60 * 1000) / (24 * 60 * 60 * 1000));
}

function kstWeekIndex(timestamp: number): number {
  const date = new Date(timestamp + 9 * 60 * 60 * 1000);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return Math.floor((kstDayIndex(timestamp) - mondayOffset) / 7);
}

function dueMatchesCompletion(commitment: Commitment, completedAt: number): boolean {
  const due = commitment.dueLabel;
  if (!due) return false;
  const dayDifference = kstDayIndex(completedAt) - kstDayIndex(commitment.createdAt);
  if (due === "오늘") return dayDifference === 0;
  if (due === "내일") return dayDifference === 1;
  if (due === "모레") return dayDifference === 2;
  if (due === "이번 주") return kstWeekIndex(completedAt) === kstWeekIndex(commitment.createdAt);
  if (due === "다음 주") return kstWeekIndex(completedAt) === kstWeekIndex(commitment.createdAt) + 1;

  const weekdays = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const completedWeekday = weekdays[new Date(completedAt + 9 * 60 * 60 * 1000).getUTCDay()];
  return due === completedWeekday && completedAt >= commitment.createdAt;
}

export function isMeetupPreparationCommitment(
  commitment: Pick<Commitment, "title"> &
    Partial<Pick<Commitment, "detail" | "sourceMessage">>
): boolean {
  if (MEETUP_COMMITMENT_TITLES.has(commitment.title)) return true;
  const context = normalize(`${commitment.detail ?? ""} ${commitment.sourceMessage ?? ""}`);
  return /(만나|보자|볼래|데이트|카페|영화|맛집|식당|장소|예매|예약)/u.test(context);
}

function requiresConfirmedMeetup(commitment: CommitmentDraft): boolean {
  if (commitment.title === "만날 약속") return true;
  const context = normalize(`${commitment.detail ?? ""} ${commitment.sourceMessage ?? ""}`);
  return /(만나|만날|만남|데이트)/u.test(context);
}

export function hasPendingMeetupCommitment(commitments: Commitment[]): boolean {
  return commitments.some(
    (commitment) => commitment.status === "pending" && isMeetupPreparationCommitment(commitment)
  );
}

export function hasConfirmedMeetupContext(input: {
  userMessage: string;
  recentMessages?: ChatMessage[];
  commitments?: Commitment[];
}): boolean {
  return (
    hasPendingMeetupCommitment(input.commitments ?? []) ||
    isUserConfirmedMeetup({
      userMessage: input.userMessage,
      recentMessages: input.recentMessages,
    })
  );
}

export function commitmentIdsForCompletedMeetup(
  commitments: Commitment[],
  recentMessages: ChatMessage[],
  completedAt: number
): string[] {
  const isFutureOnlySource = (source: string) =>
    /(나중에|다음에|언젠가|다음\s*달|다다음|또\s*(보자|볼래|만나))/u.test(source);
  const recentContext = normalize(recentMessages.slice(-20).map((message) => message.content).join(" "));
  const candidates = commitments
    .filter((commitment) => commitment.status === "pending")
    .filter(isMeetupPreparationCommitment)
    .filter((commitment) => commitment.createdAt <= completedAt)
    .sort((left, right) => right.createdAt - left.createdAt);

  const matched = candidates.filter((commitment) => {
    if (commitment.dueLabel) return dueMatchesCompletion(commitment, completedAt);
    const source = normalize(commitment.sourceMessage ?? "");
    if (isFutureOnlySource(source)) return false;
    return source.length >= 4 && recentContext.includes(source);
  });
  const currentUndated = candidates.filter(
    (commitment) =>
      !commitment.dueLabel &&
      !isFutureOnlySource(normalize(commitment.sourceMessage ?? ""))
  );
  for (const commitment of currentUndated) {
    if (!matched.some((item) => item.id === commitment.id)) matched.push(commitment);
  }

  return matched.map((commitment) => commitment.id);
}

export function extractCommitmentsFromTurn(input: {
  userMessage: string;
  assistantMessage?: string | null;
  recentMessages?: ChatMessage[];
  existingCommitments?: Commitment[];
}): CommitmentDraft[] {
  const drafts: CommitmentDraft[] = [];
  const priorAssistant = latestAssistantMessage(input.recentMessages ?? []);
  const userConfirmedMeetup = isUserConfirmedMeetup({
    userMessage: input.userMessage,
    recentMessages: input.recentMessages,
  });
  const hasConfirmedMeetup = hasConfirmedMeetupContext({
    userMessage: input.userMessage,
    recentMessages: input.recentMessages,
    commitments: input.existingCommitments,
  });

  if (userConfirmedMeetup) {
    const directConfirmation = isDirectUserMeetupConfirmation(input.userMessage);
    const currentUserText = normalize(input.userMessage);
    const shouldIncludeProposal =
      Boolean(priorAssistant && MEETUP_PROPOSAL_PATTERN.test(normalize(priorAssistant))) &&
      !detectDueLabel(currentUserText);
    const source = directConfirmation && !shouldIncludeProposal
      ? currentUserText
      : normalize(`${priorAssistant ?? ""} / 사용자 확인: ${currentUserText}`);
    drafts.push({
      title: "만날 약속",
      detail: compact(source),
      owner: "shared",
      dueLabel: detectDueLabel(source),
      sourceMessage: compact(source, 160),
    });
  }
  const items: Array<{ role: ChatMessage["role"]; text: string }> = [
    { role: "user", text: input.userMessage },
    ...(input.assistantMessage ? [{ role: "assistant" as const, text: input.assistantMessage }] : []),
  ];

  for (const item of items) {
    const text = normalize(item.text);
    if (!isCommitmentLike(text)) continue;

    const title = titleFor(text);
    if (!title) continue;

    const draft: CommitmentDraft = {
      title,
      detail: compact(text),
      owner: detectOwner(item.role, text),
      dueLabel: detectDueLabel(text),
      sourceMessage: compact(text, 160),
    };
    if (requiresConfirmedMeetup(draft) && !hasConfirmedMeetup) continue;
    if (
      (input.existingCommitments ?? []).some(
        (existing) =>
          existing.status === "pending" &&
          existing.title === draft.title &&
          existing.dueLabel === draft.dueLabel
      )
    ) {
      continue;
    }
    if (
      drafts.some(
        (existing) => existing.title === draft.title
      )
    ) {
      continue;
    }
    drafts.push(draft);
  }

  return drafts;
}

export function buildCommitmentPromptHint(commitments: Commitment[]): string {
  const pending = commitments.filter((item) => item.status === "pending").slice(-5);
  if (pending.length === 0) return "";

  const ownerLabel: Record<Commitment["owner"], string> = {
    user: "유저가 맡음",
    assistant: "네가 맡음",
    shared: "둘이 함께 정함",
  };

  return `
[아직 이어지는 약속/계획]
아래 내용은 잊지 않기 위한 참고 정보지만, 마지막 user 메시지의 현재 화제보다 우선하지 않아.
현재 메시지와 관련 있거나 실제 약속 시점이 가까울 때만 자연스럽게 이어서 말하고, 관련 없는 새 화제에는 끌어오지 마.
네가 맡은 일은 관련 상황에서 까먹은 척하지 마:
${pending
  .map((item) => {
    const due = item.dueLabel ? ` / ${item.dueLabel}` : "";
    const detail = item.detail ? ` — ${item.detail}` : "";
    return `- ${item.title} (${ownerLabel[item.owner]}${due})${detail}`;
  })
  .join("\n")}
`.trim();
}
