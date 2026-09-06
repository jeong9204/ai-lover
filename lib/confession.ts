import { CONFESSION_SCORE_THRESHOLD } from "./schema";

const CONFESSION_TEXT_SCORE_THRESHOLD = 40;

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const USER_CONFESSION_PATTERN =
  /(사귀자|사귈래|사겨|사귄|사귀는\s*거|우리\s*사귀|우리\s*무슨\s*사이|연인|남친|여친|여자친구|남자친구|좋아해|좋아하냐|좋아하지|고백|나랑\s*만날래)/;

const ASSISTANT_ACCEPTANCE_PATTERN =
  /(나도\s*(좋아|좋아해|그래|같은\s*마음|마찬가지|그랬어)|좋아해|사귀자|사귀는\s*거|그래\s*사귀|우리\s*사귀|그러자|확정|인정할게|연인|남친|여친|여자친구|남자친구|좋아\s*그렇게\s*하자|나도.*마음)/;

const ASSISTANT_REJECTION_OR_DEFERRAL_PATTERN =
  /(아직|미안|친구로|친구\s*사이|장난|농담|어렵|힘들|모르겠|천천히|생각해|아니|안\s*(돼|되겠|될))/;

const STRONG_USER_RELATIONSHIP_PATTERN =
  /(우리\s*(진짜\s*)?(사겨|사귀|사귄|사귀는\s*거)|사귀자|사귈래|나도\s*.*좋아해|너도\s*도망\s*못\s*가|도망\s*못\s*가)/;

const STRONG_ASSISTANT_RELATIONSHIP_PATTERN =
  /(맞아.*사귀는\s*거|사귀는\s*거|우리\s*(진짜\s*)?사귀|확정|인정할게|내\s*(여자친구|남자친구)|나도\s*.*좋아해|도망\s*안\s*가)/;

export function findAcceptedConfessionTimestamp(
  messages: Array<{ role: string; content: string; timestamp: number }>,
  relationshipScore: number,
  alreadyConfessed: boolean
): number | null {
  if (alreadyConfessed) return null;

  const recentMessages = messages.slice(-24);
  for (let index = recentMessages.length - 1; index >= 1; index -= 1) {
    const assistantMessage = recentMessages[index];
    if (assistantMessage.role !== "assistant") continue;

    for (let previousIndex = index - 1; previousIndex >= Math.max(0, index - 4); previousIndex -= 1) {
      const userMessage = recentMessages[previousIndex];
      if (userMessage.role !== "user") continue;

      const accepted = shouldAcceptConfessionEnding({
        requestedEvent: false,
        alreadyConfessed: false,
        relationshipScore,
        userMessage: userMessage.content,
        assistantMessage: assistantMessage.content,
      });
      if (accepted) return assistantMessage.timestamp;
    }
  }

  return null;
}

export function shouldAcceptConfessionEnding({
  requestedEvent,
  alreadyConfessed,
  relationshipScore,
  userMessage,
  assistantMessage,
}: {
  requestedEvent: boolean;
  alreadyConfessed: boolean;
  relationshipScore: number;
  userMessage: string;
  assistantMessage: string;
}): boolean {
  if (alreadyConfessed) return false;

  const normalizedUser = normalize(userMessage);
  const normalizedAssistant = normalize(assistantMessage);

  if (!USER_CONFESSION_PATTERN.test(normalizedUser)) return false;
  if (ASSISTANT_REJECTION_OR_DEFERRAL_PATTERN.test(normalizedAssistant)) return false;
  if (!ASSISTANT_ACCEPTANCE_PATTERN.test(normalizedAssistant)) return false;

  if (requestedEvent && relationshipScore >= CONFESSION_SCORE_THRESHOLD) return true;

  const hasStrongMutualConfirmation =
    STRONG_USER_RELATIONSHIP_PATTERN.test(normalizedUser) &&
    STRONG_ASSISTANT_RELATIONSHIP_PATTERN.test(normalizedAssistant);

  return (
    relationshipScore >= CONFESSION_TEXT_SCORE_THRESHOLD &&
    hasStrongMutualConfirmation
  );
}
