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

export function extractCommitmentsFromTurn(input: {
  userMessage: string;
  assistantMessage?: string | null;
}): CommitmentDraft[] {
  const drafts: CommitmentDraft[] = [];
  const items: Array<{ role: ChatMessage["role"]; text: string }> = [
    { role: "user", text: input.userMessage },
    ...(input.assistantMessage ? [{ role: "assistant" as const, text: input.assistantMessage }] : []),
  ];

  for (const item of items) {
    const text = normalize(item.text);
    if (!isCommitmentLike(text)) continue;

    const title = titleFor(text);
    if (!title) continue;

    drafts.push({
      title,
      detail: compact(text),
      owner: detectOwner(item.role, text),
      dueLabel: detectDueLabel(text),
      sourceMessage: compact(text, 160),
    });
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
아래 내용은 일반 대화보다 우선해서 기억해야 하는 미완료 약속이야.
관련 화제가 나오면 자연스럽게 이어서 말하고, 네가 맡은 일은 까먹은 척하지 마:
${pending
  .map((item) => {
    const due = item.dueLabel ? ` / ${item.dueLabel}` : "";
    const detail = item.detail ? ` — ${item.detail}` : "";
    return `- ${item.title} (${ownerLabel[item.owner]}${due})${detail}`;
  })
  .join("\n")}
`.trim();
}
