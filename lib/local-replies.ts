import type { PersonaType } from "./persona";
import type { Emotion } from "./schema";

const SHORT_REACTION_MAX_LENGTH = 10;

const LOCAL_REPLIES: Record<PersonaType, Record<"laughter" | "ack", string[]>> = {
  default: {
    laughter: ["ㅋㅋ 뭐야", "왜 그렇게 웃어ㅋㅋ", "아 웃기긴 하네"],
    ack: ["응응", "그래그래", "오케이"],
  },
  northern_duke: {
    laughter: ["웃기냐.", "...그래 웃어라.", "뭐가 그렇게 웃겨."],
    ack: ["그래.", "알았어.", "응."],
  },
  flirty: {
    laughter: ["웃는 거 귀엽네.", "ㅋㅋ 나 때문에 웃었냐?", "그렇게 웃으면 나도 웃기잖아."],
    ack: ["응, 착하네.", "알겠어. 얌전히 있어.", "그래, 그렇게 해."],
  },
};

function compactReaction(message: string): string {
  return message
    .replace(/[~!,.。…?？\s]/g, "")
    .replace(/[ㅠㅜㅡ]+/g, "")
    .trim();
}

function hashText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickReply(
  personaType: PersonaType,
  kind: "laughter" | "ack",
  seed: string,
  recentAssistantReplies: string[] = []
): string {
  const replies = LOCAL_REPLIES[personaType][kind] ?? LOCAL_REPLIES.default[kind];
  const reusable = replies.filter((reply) => !recentAssistantReplies.includes(reply));
  const candidates = reusable.length > 0 ? reusable : replies;
  return candidates[hashText(seed) % candidates.length];
}

export function buildLocalShortReactionReply(
  message: string,
  personaType: PersonaType,
  seed: string,
  recentAssistantReplies: string[] = []
): { message: string; emotion: Emotion; intensity: number } | null {
  const compact = compactReaction(message);
  if (!compact || compact.length > SHORT_REACTION_MAX_LENGTH) return null;

  if (/^[ㅋㅎ]+$/.test(compact)) {
    return {
      message: pickReply(personaType, "laughter", `${seed}:${message}:laughter`, recentAssistantReplies),
      emotion: "neutral",
      intensity: 0.2,
    };
  }

  if (/^(응+|웅+|ㅇㅇ+|어+|엉+|오키|오케이|ㅇㅋ|알겠어|알겟어|아하|아아)$/.test(compact)) {
    return {
      message: pickReply(personaType, "ack", `${seed}:${message}:ack`, recentAssistantReplies),
      emotion: "neutral",
      intensity: 0.15,
    };
  }

  return null;
}
