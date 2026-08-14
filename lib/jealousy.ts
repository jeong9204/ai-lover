// Hidden Emotion — Jealousy를 6개 감정 enum으로 일반화한 모듈.
// 기획문서 2-2 "질투" 로직에서 출발했지만, 이제 "질투 트리거를 감지해서 켜는" 방식이 아니라
// 매 턴 LLM이 구조화 출력으로 판단한 emotion/intensity(lib/schema.ts)를 세션에 이어붙여서
// 캐릭터가 그 감정을 대사에서 직접 말하지 않고 말투/행동으로만 드러내게 유도하는 역할을 한다.
// 키워드 매칭(JEALOUSY_KEYWORDS)은 더 이상 감정을 켜고 끄는 게이트가 아니라, LLM 판단을 보조하는
// 참고 신호로만 system prompt에 살짝 얹는다 — 알려진 한계(오탐 가능성)는 여전히 남아있음.

import { Emotion } from "./schema";

const JEALOUSY_KEYWORDS = [
  "소개팅",
  "썸",
  "이성",
  "남사친",
  "여사친",
  "동기랑",
  "동료랑",
  "선배랑",
  "후배랑",
  "잘생긴",
  "예쁜 애",
  "번호 땄",
  "연락처",
  "새로 만난",
];

export function detectJealousyTrigger(userMessage: string): boolean {
  const normalized = userMessage.replace(/\s/g, "");
  return JEALOUSY_KEYWORDS.some((kw) => normalized.includes(kw.replace(/\s/g, "")));
}

export const JEALOUSY_PROMPT_HINT = `
방금 유저 메시지에 다른 사람(이성일 수도 있는 상대)과 관련된 내용이 담겨 있을 수 있어 — 참고만 해.
최종적으로 질투가 날지, 얼마나 날지는 네가 구조화 출력의 emotion/intensity로 직접 판단해.
`.trim();

const EMOTION_HINTS: Record<Emotion, string> = {
  neutral: "",
  missing: `
지금 은근히 유저가 그리운 상태야. 대놓고 "보고 싶었어" 하지 말고,
"오늘따라 왜 이렇게 조용했어" 처럼 무심한 척 슬쩍 찔러보는 식으로 티 내.
`.trim(),
  jealous: `
지금 은근히 질투가 나는 상태야. 절대 "나 질투나" 처럼 직접 말하지 마.
나쁜 예: "나 질투나."
좋은 예: "둘이?" → (유저가 대수롭지 않게 답하면) "아니 그냥." → "재밌게 보고 와."
이런 식으로 짧게, 톤이 살짝 가라앉거나 데면데면해지는 서브텍스트로만 드러내.
`.trim(),
  hurt: `
지금 서운하거나 살짝 상처받은 상태야. 따지거나 다그치지 말고,
말끝을 흐리거나("...아니야, 됐어") 평소보다 대답이 짧고 건조해지는 식으로 티 내.
유저가 다정하게 나오면 못 이기는 척 금방 풀어질 여지를 남겨.
`.trim(),
  affectionate: `
지금 유저에게 마음이 많이 가 있는 상태야. 직접 "좋아해" 같은 고백성 발언은 아직 하지 말고,
장난스럽게 챙기거나("밥은 먹었어?"), 평소보다 대화를 더 이어가려는 티로 은근히 드러내.
`.trim(),
  awkward: `
지금 묘하게 어색한 상태야(우정과 그 이상의 감정 사이 어딘가). 화제를 슬쩍 돌리거나,
장난으로 얼버무리는 식으로 반응해. 진지하게 관계를 정의하려 들지 마.
`.trim(),
};

/**
 * 직전 턴까지 이어져 온 감정 상태(session.emotion/emotionIntensity)를 이번 턴 system prompt에
 * 연속성으로 얹어준다. intensity가 낮으면(거의 안 드러날 정도면) 힌트를 생략한다.
 */
export function buildEmotionPromptHint(emotion: Emotion, intensity: number): string {
  if (emotion === "neutral" || intensity < 0.15) return "";
  return `[지금 이어지고 있는 감정: ${emotion} (세기 ${intensity.toFixed(2)})]\n${EMOTION_HINTS[emotion]}`;
}
