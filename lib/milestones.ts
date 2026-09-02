import { Emotion } from "./schema";

export interface MilestoneDraft {
  type: string;
  title: string;
  description?: string;
}

export function milestonesFromTurn(input: {
  emotion: Emotion;
  eventType?: string | null;
  userMessage?: string;
  assistantMessage?: string | null;
  durationSec?: number;
}): MilestoneDraft[] {
  const drafts: MilestoneDraft[] = [];

  if (input.emotion === "jealous") {
    drafts.push({
      type: "first_jealousy",
      title: "처음 질투가 새어 나온 날",
      description: "아무렇지 않은 척했지만 말투에 신경 쓰는 티가 났다.",
    });
  }

  if (input.emotion === "hurt" || input.emotion === "awkward") {
    drafts.push({
      type: "first_awkward_moment",
      title: "처음 어색해진 날",
      description: "편한 사이인데도 잠깐 말이 조심스러워졌다.",
    });
  }

  if (input.eventType === "call_request") {
    drafts.push({
      type: "first_call_request",
      title: "처음 전화하자고 한 날",
      description: "텍스트보다 목소리가 필요한 순간이 생겼다.",
    });
  }

  if (input.eventType === "call_ended") {
    const minutes = Math.max(0, Math.round((input.durationSec ?? 0) / 60));
    drafts.push({
      type: "first_call",
      title: "처음 통화한 날",
      description: minutes > 0 ? `${minutes}분쯤 통화하고 대화로 돌아왔다.` : "짧게 통화하고 대화로 돌아왔다.",
    });
  }

  if (input.eventType === "confession_ending") {
    drafts.push({
      type: "confession_day",
      title: "서로 마음을 확인한 날",
      description: "오래 돌려 말하던 관계가 연인이 되었다.",
    });
  }

  if (input.eventType === "reconnect_first_message") {
    drafts.push({
      type: "first_reconnect_message",
      title: "처음 먼저 연락한 날",
      description: "네가 말 걸기 전에 이준이 먼저 대화를 이어왔다.",
    });
  }

  return drafts;
}

export function inferMemoryType(input: {
  emotion: Emotion;
  eventType?: string | null;
  memory: string;
}): "user" | "relationship" {
  if (input.eventType || input.emotion === "jealous" || input.emotion === "hurt" || input.emotion === "awkward") {
    return "relationship";
  }

  const relationshipWords = ["이준", "우리", "통화", "질투", "서운", "화해", "고백", "어색", "먼저 연락"];
  return relationshipWords.some((word) => input.memory.includes(word)) ? "relationship" : "user";
}
