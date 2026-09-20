import assert from "node:assert/strict";
import {
  applyConversationTopicUpdate,
  completeMeetupTopicState,
  EMPTY_CONVERSATION_TOPIC_STATE,
  normalizeConversationTopicState,
} from "../lib/conversation-topics.ts";
import { commitmentIdsForCompletedMeetup } from "../lib/commitments.ts";

function update(state, patch) {
  return applyConversationTopicUpdate(state, {
    recentTopics: [],
    exhaustedTopics: [],
    unresolvedTopics: [],
    resolvedTopics: [],
    ...patch,
  });
}

let companyState = EMPTY_CONVERSATION_TOPIC_STATE;
companyState = update(companyState, { recentTopics: ["회사 힘든 일 상세"] });
companyState = update(companyState, { recentTopics: ["팀장 수정 지시"] });
companyState = update(companyState, {
  recentTopics: ["회사 수정 스트레스 마무리"],
  exhaustedTopics: ["팀장 수정 지시"],
});
assert.deepEqual(companyState, {
  recentTopics: [],
  exhaustedTopics: ["회사 업무 스트레스"],
  unresolvedTopics: [],
});

const chitchatState = update(EMPTY_CONVERSATION_TOPIC_STATE, {
  recentTopics: ["오랜만 인사", "말더듬 놀림", "뭐해 질문", "웃음"],
});
assert.deepEqual(chitchatState, EMPTY_CONVERSATION_TOPIC_STATE);

const lastingState = update(EMPTY_CONVERSATION_TOPIC_STATE, {
  recentTopics: ["회사 때문에 힘든 상태", "일주일째 잠을 못 자는 문제"],
});
assert.deepEqual(lastingState.recentTopics, ["회사 업무 스트레스", "수면 문제"]);

const reusedState = update(
  { recentTopics: ["회사 업무 스트레스"], exhaustedTopics: [], unresolvedTopics: [] },
  { recentTopics: ["팀장 수정 지시"] }
);
assert.deepEqual(reusedState.recentTopics, ["회사 업무 스트레스"]);

const normalizedConflict = normalizeConversationTopicState({
  recentTopics: ["회사 힘든 일 상세"],
  exhaustedTopics: ["팀장 수정 지시"],
  unresolvedTopics: [],
});
assert.deepEqual(normalizedConflict, {
  recentTopics: [],
  exhaustedTopics: ["회사 업무 스트레스"],
  unresolvedTopics: [],
});

const completedMeetupTopics = completeMeetupTopicState({
  recentTopics: ["오늘 만날 약속", "새로 산 신발"],
  exhaustedTopics: [],
  unresolvedTopics: ["갈 곳 정하기", "몇 시에 만날지", "토요일 영화 약속"],
});
assert.deepEqual(completedMeetupTopics, {
  recentTopics: ["새로 산 신발"],
  exhaustedTopics: [],
  unresolvedTopics: [],
});

const completedAt = Date.parse("2026-09-21T09:00:00+09:00");
const commitments = [
  {
    id: "current-meetup",
    title: "만날 약속",
    detail: "오늘 만나기로 함",
    owner: "shared",
    dueLabel: "오늘",
    status: "pending",
    sourceMessage: "오늘 저녁에 만나자",
    createdAt: Date.parse("2026-09-21T07:00:00+09:00"),
  },
  {
    id: "future-meetup",
    title: "만날 약속",
    detail: "다음 주에 다시 보기",
    owner: "shared",
    dueLabel: "다음 주",
    status: "pending",
    sourceMessage: "다음 주말에 또 볼래?",
    createdAt: Date.parse("2026-09-21T08:00:00+09:00"),
  },
];
const completedIds = commitmentIdsForCompletedMeetup(
  commitments,
  [
    { role: "user", content: "오늘 저녁에 만나자", timestamp: completedAt - 2000 },
    { role: "user", content: "다음 주말에 또 볼래?", timestamp: completedAt - 1000 },
  ],
  completedAt
);
assert.deepEqual(completedIds, ["current-meetup"]);

const futureTopicState = update(completedMeetupTopics, {
  unresolvedTopics: ["이번 주말 새 만남 약속"],
});
assert.deepEqual(futureTopicState.unresolvedTopics, ["이번 주말 새 만남 약속"]);

console.log("conversation topic tests: ok");
