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
  return normalized.slice(0, MAX_TOPIC_LENGTH);
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
  return {
    recentTopics: normalizeTopics(candidate.recentTopics),
    exhaustedTopics: normalizeTopics(candidate.exhaustedTopics),
    unresolvedTopics: normalizeTopics(candidate.unresolvedTopics),
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

  let next: ConversationTopicState = {
    recentTopics: removeMatching(current.recentTopics, resolved),
    exhaustedTopics: removeMatching(current.exhaustedTopics, resolved),
    unresolvedTopics: removeMatching(current.unresolvedTopics, resolved),
  };

  next.recentTopics = appendTopics(
    removeMatching(next.recentTopics, [...exhausted, ...unresolved]),
    recent
  );
  next.exhaustedTopics = appendTopics(
    removeMatching(next.exhaustedTopics, [...recent, ...unresolved]),
    exhausted
  );
  next.unresolvedTopics = appendTopics(
    removeMatching(next.unresolvedTopics, [...recent, ...exhausted]),
    unresolved
  );

  return next;
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
- 이미 충분히 이야기한 소재는 마지막 user 메시지가 직접 다시 언급하지 않는 한 네가 먼저 꺼내지 마.
- 최근 대화 소재와 같은 질문을 표현만 바꿔 반복하지 마.
- 아직 이어질 수 있는 소재는 관련 시점이나 자연스러운 계기가 있을 때만 다시 언급해.
- 새 화제를 억지로 만들기 위해 과거 대화를 재활용하지 마. 질문 없이 짧게 반응해도 돼.
- 마지막 user 메시지가 충분히 이야기한 소재를 직접 다시 꺼냈다면 피하지 말고 현재 말에 자연스럽게 답해.
`.trim();
}
