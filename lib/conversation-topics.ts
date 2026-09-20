export interface ConversationTopicState {
  recentTopics: string[];
  exhaustedTopics: string[];
  unresolvedTopics: string[];
}

export interface ConversationTopicUpdate extends ConversationTopicState {
  resolvedTopics: string[];
}

const MAX_TOPICS_PER_GROUP = 6;
const MAX_TOPIC_LENGTH = 40;
const TOPIC_META_SUFFIX_PATTERN = /\s*(상세|마무리|언급|대화|이야기|질문|답변)$/u;
const DISPOSABLE_CHITCHAT_PATTERN =
  /^(오랜만(?:이야)?(?:\s*인사)?|인사|안부|근황\s*질문|말\s*더듬(?:기)?(?:\s*놀림)?|웃음|농담|장난|짧은\s*반응|리액션|뭐\s*해(?:\s*질문)?|잘\s*잤어(?:\s*질문)?|졸려|배고파)$/u;
const MEETUP_PREPARATION_TOPIC_PATTERN =
  /((오늘|내일|모레|주말|이번\s*주|다음\s*주).*(만나|만날|보기|볼\s*약속|데이트)|(영화|카페|식사|저녁|주말).*약속|데이트\s*(약속|준비|장소|시간)|갈\s*곳|장소\s*(정|고르)|몇\s*시|만날\s*시간|지각|늦으면|만나기\s*전|입을\s*옷|뭐\s*입고)/u;

export const EMPTY_CONVERSATION_TOPIC_STATE: ConversationTopicState = {
  recentTopics: [],
  exhaustedTopics: [],
  unresolvedTopics: [],
};

function compactTopic(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .normalize("NFKC")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,./#!$%^&*;:{}=\-_`~()]+|[\s,./#!$%^&*;:{}=\-_`~()]+$/g, "")
    .trim();
  if (!normalized) return null;

  let topic = normalized;
  while (TOPIC_META_SUFFIX_PATTERN.test(topic)) {
    topic = topic.replace(TOPIC_META_SUFFIX_PATTERN, "").trim();
  }
  if (!topic || DISPOSABLE_CHITCHAT_PATTERN.test(topic)) return null;

  const hasWorkContext = /(회사|업무|직장|팀장|상사|퇴근|야근|수정)/u.test(topic);
  const hasWorkStress = /(힘들|힘든|힘듦|고된|스트레스|수정|지시|압박|야근|과로)/u.test(topic);
  if (hasWorkContext && hasWorkStress) return "회사 업무 스트레스";

  const hasSleepContext = /(잠|수면|불면)/u.test(topic);
  const hasSleepProblem = /(못|문제|부족|설치|깨|피곤)/u.test(topic);
  if (hasSleepContext && hasSleepProblem) return "수면 문제";

  const hasMealContext = /(식사|밥|끼니)/u.test(topic);
  const hasMealProblem = /(못|거르|문제|제대로)/u.test(topic);
  if (hasMealContext && hasMealProblem) return "식사 문제";

  return topic.slice(0, MAX_TOPIC_LENGTH);
}

function topicKey(topic: string): string {
  return topic.replace(/[^\p{L}\p{N}]/gu, "").toLocaleLowerCase("ko-KR");
}

function isSameTopic(left: string, right: string): boolean {
  const leftKey = topicKey(left);
  const rightKey = topicKey(right);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;
  return Math.min(leftKey.length, rightKey.length) >= 4 &&
    (leftKey.includes(rightKey) || rightKey.includes(leftKey));
}

function normalizeTopics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const topics: string[] = [];
  for (const item of value) {
    const topic = compactTopic(item);
    if (!topic) continue;
    const duplicateIndex = topics.findIndex((existing) => isSameTopic(existing, topic));
    if (duplicateIndex >= 0) topics.splice(duplicateIndex, 1);
    topics.push(topic);
  }
  return topics.slice(-MAX_TOPICS_PER_GROUP);
}

export function normalizeConversationTopicState(value: unknown): ConversationTopicState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_CONVERSATION_TOPIC_STATE };
  }
  const candidate = value as Partial<ConversationTopicState>;
  const unresolvedTopics = normalizeTopics(candidate.unresolvedTopics);
  const exhaustedTopics = removeMatching(
    normalizeTopics(candidate.exhaustedTopics),
    unresolvedTopics
  );
  const recentTopics = removeMatching(
    normalizeTopics(candidate.recentTopics),
    [...exhaustedTopics, ...unresolvedTopics]
  );
  return {
    recentTopics,
    exhaustedTopics,
    unresolvedTopics,
  };
}

function removeMatching(topics: string[], targets: string[]): string[] {
  return topics.filter((topic) => !targets.some((target) => isSameTopic(topic, target)));
}

function appendTopics(current: string[], additions: string[]): string[] {
  const next = [...current];
  for (const topic of additions) {
    const duplicateIndex = next.findIndex((existing) => isSameTopic(existing, topic));
    if (duplicateIndex >= 0) next.splice(duplicateIndex, 1);
    next.push(topic);
  }
  return next.slice(-MAX_TOPICS_PER_GROUP);
}

export function applyConversationTopicUpdate(
  currentValue: ConversationTopicState,
  updateValue: ConversationTopicUpdate
): ConversationTopicState {
  const current = normalizeConversationTopicState(currentValue);
  const recent = normalizeTopics(updateValue.recentTopics);
  const exhausted = normalizeTopics(updateValue.exhaustedTopics);
  const unresolved = normalizeTopics(updateValue.unresolvedTopics);
  const resolved = normalizeTopics(updateValue.resolvedTopics);
  const incomingRecent = removeMatching(recent, [...exhausted, ...unresolved]);
  const incomingExhausted = removeMatching(exhausted, unresolved);

  let next: ConversationTopicState = {
    recentTopics: removeMatching(current.recentTopics, resolved),
    exhaustedTopics: removeMatching(current.exhaustedTopics, resolved),
    unresolvedTopics: removeMatching(current.unresolvedTopics, resolved),
  };

  next.recentTopics = appendTopics(
    removeMatching(next.recentTopics, [...incomingExhausted, ...unresolved]),
    incomingRecent
  );
  next.exhaustedTopics = appendTopics(
    removeMatching(next.exhaustedTopics, [...incomingRecent, ...unresolved]),
    incomingExhausted
  );
  next.unresolvedTopics = appendTopics(
    removeMatching(next.unresolvedTopics, [...recent, ...exhausted]),
    unresolved
  );

  // 한 턴의 구조화 출력이 충돌하더라도 unresolved > exhausted > recent 순으로 하나만 남긴다.
  next.exhaustedTopics = removeMatching(next.exhaustedTopics, next.unresolvedTopics);
  next.recentTopics = removeMatching(next.recentTopics, [
    ...next.exhaustedTopics,
    ...next.unresolvedTopics,
  ]);

  return next;
}

export function completeMeetupTopicState(stateValue: ConversationTopicState): ConversationTopicState {
  const state = normalizeConversationTopicState(stateValue);
  const withoutMeetupPreparation = (topics: string[]) =>
    topics.filter((topic) => !MEETUP_PREPARATION_TOPIC_PATTERN.test(topic));

  return {
    recentTopics: withoutMeetupPreparation(state.recentTopics),
    exhaustedTopics: withoutMeetupPreparation(state.exhaustedTopics),
    unresolvedTopics: withoutMeetupPreparation(state.unresolvedTopics),
  };
}

export function buildConversationTopicPromptHint(stateValue: ConversationTopicState): string {
  const state = normalizeConversationTopicState(stateValue);
  const list = (items: string[]) => (items.length > 0 ? items.join(" / ") : "없음");

  return `
[대화 소재 상태]
- 최근 대화 소재: ${list(state.recentTopics)}
- 이미 충분히 이야기한 소재: ${list(state.exhaustedTopics)}
- 아직 이어질 수 있는 소재: ${list(state.unresolvedTopics)}

규칙:
- Topic은 메시지 요약이 아니라, 나중에 다시 참조할 가치가 있는 지속적인 대화 소재야.
- 기존 세 목록에 의미상 같은 소재가 있으면 새 이름을 만들지 말고 반드시 기존 Topic 명칭을 재사용해.
- 이미 충분히 이야기한 소재는 마지막 user 메시지가 직접 다시 언급하지 않는 한 네가 먼저 꺼내지 마.
- 최근 대화 소재와 같은 질문을 표현만 바꿔 반복하지 마.
- 아직 이어질 수 있는 소재는 관련 시점이나 자연스러운 계기가 있을 때만 다시 언급해.
- 새 화제를 억지로 만들기 위해 과거 대화를 재활용하지 마. 질문 없이 짧게 반응해도 돼.
- 마지막 user 메시지가 충분히 이야기한 소재를 직접 다시 꺼냈다면 피하지 말고 현재 말에 자연스럽게 답해.
`.trim();
}
