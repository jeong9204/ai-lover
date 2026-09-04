import { CONFESSION_SCORE_THRESHOLD } from "./schema";

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const USER_CONFESSION_PATTERN =
  /(사귀자|사귈래|사귀는\s*거야|우리\s*사귀|우리\s*무슨\s*사이|연인|남친|여친|좋아해|좋아하냐|좋아하지|고백|나랑\s*만날래)/;

const ASSISTANT_ACCEPTANCE_PATTERN =
  /(나도\s*(좋아|좋아해|그래|같은\s*마음|마찬가지|그랬어)|좋아해|사귀자|그래\s*사귀|우리\s*사귀|그러자|연인|남친|여친|좋아\s*그렇게\s*하자|나도.*마음)/;

const ASSISTANT_REJECTION_OR_DEFERRAL_PATTERN =
  /(아직|미안|친구로|친구\s*사이|장난|농담|어렵|힘들|모르겠|천천히|생각해|아니|안\s*(돼|되겠|될))/;

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
  if (!requestedEvent || alreadyConfessed) return false;
  if (relationshipScore < CONFESSION_SCORE_THRESHOLD) return false;

  const normalizedUser = normalize(userMessage);
  const normalizedAssistant = normalize(assistantMessage);

  if (!USER_CONFESSION_PATTERN.test(normalizedUser)) return false;
  if (ASSISTANT_REJECTION_OR_DEFERRAL_PATTERN.test(normalizedAssistant)) return false;
  return ASSISTANT_ACCEPTANCE_PATTERN.test(normalizedAssistant);
}
