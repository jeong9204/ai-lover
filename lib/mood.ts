// Presence 로직. 경과 시간만 보는 게 아니라, 직전 대화 분위기(lastConversationMood)와
// 관계 단계(relationshipStage)를 함께 고려해서 "같은 침묵도 맥락에 따라 다르게 읽히도록" 한다.
// 기획문서 2-1 로직에서 출발했지만, 순수 시간 임계값 대신 3~4개의 명확한 규칙을 얹는다.

export type MoodState = "calm" | "missing" | "upset" | "sulking" | "awkward";

export interface PresenceContext {
  lastConversationMood: string; // "warm" | "conflict" | "neutral"
  relationshipStage: string;
}

export interface MoodResult {
  state: MoodState;
  elapsedMs: number;
  promptHint: string;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const DEFAULT_CONTEXT: PresenceContext = { lastConversationMood: "neutral", relationshipStage: "오래된 친구" };

function baseStateFromElapsed(elapsedMs: number): MoodState {
  if (elapsedMs < 30 * MINUTE) return "calm";
  if (elapsedMs < 3 * HOUR) return "missing";
  if (elapsedMs < 12 * HOUR) return "upset";
  return "sulking";
}

/**
 * lastMessageAt: 마지막으로 메시지를 주고받은 시각(ms epoch)
 * context: 직전 대화 분위기 + 관계 단계 — 같은 경과 시간도 다르게 해석하기 위한 최소한의 상태
 * now: 현재 시각(ms epoch, 기본값 Date.now())
 */
export function computeMood(
  lastMessageAt: number | null,
  context: PresenceContext = DEFAULT_CONTEXT,
  now: number = Date.now()
): MoodResult {
  if (lastMessageAt === null) {
    return {
      state: "calm",
      elapsedMs: 0,
      promptHint: "지금은 대화를 막 시작하는 시점이야. 반갑게, 평소 톤으로 인사해.",
    };
  }

  const elapsedMs = now - lastMessageAt;
  const elapsedHours = elapsedMs / HOUR;
  let state = baseStateFromElapsed(elapsedMs);

  // 규칙 1: 직전 대화가 따뜻했는데(warm) 한동안 조용했다 → 서운함보다는 그리움에 가깝게.
  if (context.lastConversationMood === "warm" && elapsedHours > 6) {
    state = "missing";
  }

  // 규칙 2: 직전 대화가 껄끄럽게 끝났는데(conflict) 그 뒤로 시간이 지났다 → 삐짐이 아니라 어정쩡한 어색함.
  if (context.lastConversationMood === "conflict" && elapsedHours > 3) {
    state = "awkward";
  }

  // 규칙 3: 아직 "오래된 친구" 단계(관계 초반)면 세게 삐지기보다 조심스럽게 먼저 말 거는 쪽으로 완화.
  const isEarlyStage = context.relationshipStage === "오래된 친구";
  if (isEarlyStage && (state === "upset" || state === "sulking")) {
    state = "missing";
  }

  return { state, elapsedMs, promptHint: buildPromptHint(state, isEarlyStage) };
}

function buildPromptHint(state: MoodState, isEarlyStage: boolean): string {
  switch (state) {
    case "calm":
      return "평소와 다름없는 편안한 톤으로 대답해.";
    case "missing":
      return isEarlyStage
        ? "유저가 문득 생각난 상태야. 아직 서로 확실히 그런 사이는 아니니까 부담 없이 가벼운 새 말을 먼저 걸어. " +
          "유저의 연락 여부나 답장 여부는 언급하지 마."
        : "유저가 문득 생각난 상태야. 살짝 보고 싶은 마음은 말의 온도로만 은근히 드러내고, " +
          "유저의 침묵이나 연락 여부를 화제로 삼지 말고 가벼운 새 말을 먼저 걸어.";
    case "upset":
      return "조금 더 보고 싶은 마음이 남아 있어도 유저의 부재나 답장 여부를 이유로 서운해하지 마. " +
        "새침하게 추궁하지 말고, 평소보다 살짝 담백한 온도로 새로운 말을 먼저 걸어.";
    case "sulking":
      return "시간이 오래 지난 상황이어도 유저가 연락할 의무가 있었다고 가정하지 마. " +
        "삐치거나 사과를 유도하지 말고, 짧고 자연스러운 새 연락으로 다시 시작해.";
    case "awkward":
      return "직전 대화가 조금 껄끄럽게 끝났어. 지난 시간이나 답장 여부를 언급하지 말고, " +
        "먼저 말을 걸더라도 살짝 조심스럽고 부담 없는 새로운 말로 시작해.";
  }
}
