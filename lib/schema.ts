// LLM 구조화 출력 스키마. 모델이 반환한 JSON은 항상 이 스키마로 검증한 뒤에만
// 애플리케이션 상태(세션/메시지/기억)에 반영한다 — 검증 없이 신뢰하지 않는다.

import { z } from "zod";

export const EmotionEnum = z.enum([
  "neutral",
  "missing",
  "jealous",
  "hurt",
  "affectionate",
  "awkward",
]);
export type Emotion = z.infer<typeof EmotionEnum>;

export const EventSchema = z
  .object({
    type: z.enum(["deleted_message", "call_request", "confession_ending"]),
  })
  .nullable();
export type ReplyEvent = z.infer<typeof EventSchema>;

export const StructuredReplySchema = z.object({
  message: z.string(), // event가 deleted_message면 ""도 허용
  emotion: EmotionEnum,
  intensity: z.number().min(0).max(1),
  relationshipDelta: z.number().int().min(-3).max(3),
  memory: z.string().min(1).nullable(),
  event: EventSchema,
});
export type StructuredReply = z.infer<typeof StructuredReplySchema>;

const STAGE_BY_SCORE: { min: number; label: string }[] = [
  { min: 40, label: "친구라고 하기엔 조금 이상한 사이" },
  { min: 20, label: "요즘 유독 편해진 친구" },
  { min: -100, label: "오래된 친구" },
];

/** 이 점수 이상이어야 고백이 "진짜로" 받아들여진다 — 그전엔 페르소나 기본값대로 얼버무린다. */
export const CONFESSION_SCORE_THRESHOLD = 60;

/** 고백 엔딩 이후 고정되는 관계 단계 텍스트. */
export const CONFESSED_STAGE = "연인";

/** 내부 점수(relationship_score)를 한국어 관계 단계 텍스트로 변환. 숫자는 UI에 노출하지 않는다. */
export function stageForScore(score: number): string {
  const match = STAGE_BY_SCORE.find((s) => score >= s.min);
  return match?.label ?? "오래된 친구";
}

/** 이번 턴의 emotion을 다음 Presence 계산에 쓸 "직전 대화 분위기"로 단순화한다. */
export function conversationMoodFromEmotion(emotion: Emotion): "warm" | "conflict" | "neutral" {
  if (emotion === "affectionate") return "warm";
  if (emotion === "jealous" || emotion === "hurt" || emotion === "awkward") return "conflict";
  return "neutral";
}
