import { isMeetupPlanningTopic, normalizeConversationTopicState } from "./conversation-topics";
import type { ConversationTopicState } from "./conversation-topics";
import { koreanDateKey } from "./korean-date";

interface DatedItem {
  createdAt: number;
}

interface MilestoneLike extends DatedItem {
  type: string;
}

interface MemoryLike extends DatedItem {
  type: "user" | "relationship";
  text: string;
}

export interface NewDayTransitionInput {
  lastConversationAt: number | null;
  emotion: string;
  emotionIntensity: number;
  topicState: ConversationTopicState;
  milestones: MilestoneLike[];
  memories: MemoryLike[];
}

export interface NewDayTransitionResult {
  emotion: string;
  emotionIntensity: number;
  lastConversationMood: "neutral";
  topicState: ConversationTopicState;
}

const SIGNIFICANT_MILESTONE_TYPES = new Set([
  "confession_day",
  "first_meetup",
  "first_call",
  "first_awkward_moment",
  "first_jealousy",
]);
const SIGNIFICANT_MEMORY_PATTERN = /(고백|싸움|다퉜|사과|화해|질투|서운|데이트|만났|통화)/u;
const TRANSIENT_RECENT_TOPIC_PATTERN =
  /(오늘|지금|아까|이따|조금\s*있다|졸림|졸려|배고픔|배고파|피곤|심심|야식|붓기|샤워|씻|외출\s*중|술\s*마|잠\s*안\s*옴)/u;
const RELATIVE_UNRESOLVED_PATTERN =
  /(오늘|내일|모레|이따|조금\s*있다).*(깨워|전화|만나|약속|보기|데이트|장소|시간)/u;

function roundIntensity(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

function hasSignificantPreviousDayEvent(
  previousDate: string,
  milestones: MilestoneLike[],
  memories: MemoryLike[]
): boolean {
  return (
    milestones.some(
      (milestone) =>
        koreanDateKey(milestone.createdAt) === previousDate &&
        SIGNIFICANT_MILESTONE_TYPES.has(milestone.type)
    ) ||
    memories.some(
      (memory) =>
        koreanDateKey(memory.createdAt) === previousDate &&
        memory.type === "relationship" &&
        SIGNIFICANT_MEMORY_PATTERN.test(memory.text)
    )
  );
}

export function decayEmotionForNewDay(
  emotion: string,
  intensity: number,
  significantEvent: boolean
): { emotion: string; intensity: number } {
  let factor = 0.5;
  if (emotion === "affectionate") factor = significantEvent ? 0.9 : 0.8;
  else if (emotion === "neutral") factor = 0.5;
  else if (significantEvent) factor = 0.7;

  const nextIntensity = roundIntensity(intensity * factor);
  return {
    emotion: nextIntensity < 0.15 ? "neutral" : emotion,
    intensity: nextIntensity < 0.15 ? 0 : nextIntensity,
  };
}

function carryTopicsIntoNewDay(stateValue: ConversationTopicState): ConversationTopicState {
  const state = normalizeConversationTopicState(stateValue);
  return {
    recentTopics: state.recentTopics.filter(
      (topic) => !TRANSIENT_RECENT_TOPIC_PATTERN.test(topic)
    ),
    exhaustedTopics: state.exhaustedTopics,
    unresolvedTopics: state.unresolvedTopics.filter(
      (topic) =>
        !isMeetupPlanningTopic(topic) && !RELATIVE_UNRESOLVED_PATTERN.test(topic)
    ),
    ...(state.dayTransition ? { dayTransition: state.dayTransition } : {}),
  };
}

export function computeNewDayTransition(
  input: NewDayTransitionInput,
  now = Date.now()
): NewDayTransitionResult | null {
  if (input.lastConversationAt === null) return null;
  const previousDate = koreanDateKey(input.lastConversationAt);
  const currentDate = koreanDateKey(now);
  if (previousDate === currentDate) return null;
  if (input.topicState.dayTransition?.currentDate === currentDate) return null;

  const significantEvent = hasSignificantPreviousDayEvent(
    previousDate,
    input.milestones,
    input.memories
  );
  const emotionAfter = decayEmotionForNewDay(
    input.emotion,
    input.emotionIntensity,
    significantEvent
  );
  const topicState = carryTopicsIntoNewDay(input.topicState);
  topicState.dayTransition = {
    previousDate,
    currentDate,
    emotionBefore: {
      emotion: input.emotion,
      intensity: roundIntensity(input.emotionIntensity),
    },
    emotionAfter,
    significantEvent,
    processedAt: now,
  };

  return {
    emotion: emotionAfter.emotion,
    emotionIntensity: emotionAfter.intensity,
    lastConversationMood: "neutral",
    topicState,
  };
}
