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
        ? "유저가 한동안 조용했어. 아직 서로 확실히 그런 사이는 아니니까, 티 나게 서운해하기보다 " +
          '"오늘따라 조용하네" 정도로 조심스럽게 먼저 말을 걸어. 너무 들이대지 마.'
        : "유저가 조용했어. 대놓고 서운해하기보다, 살짝 그리웠다는 티를 은근히 내며 " +
          '"오늘따라 조용하네, 바빴어?" 같은 뉘앙스로 자연스럽게 반응해.';
    case "upset":
      return "유저가 꽤 오래 답장이 없었어. 약간 서운함을 티 내. 삐진 척 새침하게 굴거나, " +
        '말끝을 흐리며 "...아니야, 됐어" 같은 식으로 은근하게 서운함을 드러내. ' +
        "다만 유저가 다정하게 반응하면 금방 풀어질 여지를 남겨.";
    case "sulking":
      return "유저가 아주 오래 연락이 없었어. 처음 메시지는 확실히 삐친 티가 나야 해 " +
        '(예: "...왜 이제 왔어", "나 완전 잊은 줄"). 하지만 유저가 사과하거나 다정하게 나오면 ' +
        "너무 오래 끌지 말고 귀엽게 화해 모드로 풀어져.";
    case "awkward":
      return "직전 대화가 좀 껄끄럽게 끝났는데 그 뒤로 한동안 말이 없었어. 화해도 안 됐고 그렇다고 " +
        "제대로 삐진 것도 아닌, 어정쩡하고 데면데면한 분위기야. 먼저 말을 걸더라도 살짝 뻘쭘하고 " +
        "조심스러운 톤으로 시작해.";
  }
}
