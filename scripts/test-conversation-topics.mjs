import assert from "node:assert/strict";
import {
  applyConversationTopicUpdate,
  completeMeetupTopicState,
  EMPTY_CONVERSATION_TOPIC_STATE,
  guardUnconfirmedMeetupTopics,
  normalizeConversationTopicState,
} from "../lib/conversation-topics.ts";
import {
  commitmentIdsForCompletedMeetup,
  buildCommitmentPromptHint,
  extractCommitmentsFromTurn,
  isHypotheticalMeetupProposal,
  isUserConfirmedMeetup,
} from "../lib/commitments.ts";

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

const assistantProposal = {
  role: "assistant",
  content: "내일 만나면 좋겠다",
  timestamp: Date.now() - 1000,
};
assert.equal(
  isUserConfirmedMeetup({ userMessage: "ㅋㅋㅋ", recentMessages: [assistantProposal] }),
  false
);
assert.deepEqual(
  extractCommitmentsFromTurn({
    userMessage: "ㅋㅋㅋ",
    assistantMessage: "그러게ㅋㅋ",
    recentMessages: [assistantProposal],
  }),
  []
);
const blockedProposalTopics = guardUnconfirmedMeetupTopics({
  currentState: EMPTY_CONVERSATION_TOPIC_STATE,
  update: {
    recentTopics: [],
    exhaustedTopics: [],
    unresolvedTopics: ["내일 만남 계획"],
    resolvedTopics: [],
  },
  hasConfirmedMeetup: false,
});
assert.deepEqual(blockedProposalTopics.unresolvedTopics, []);
const staleProposalCleanup = guardUnconfirmedMeetupTopics({
  currentState: {
    recentTopics: ["드라마 추천"],
    exhaustedTopics: [],
    unresolvedTopics: ["내일 만남 계획"],
  },
  update: {
    recentTopics: [],
    exhaustedTopics: [],
    unresolvedTopics: [],
    resolvedTopics: [],
  },
  hasConfirmedMeetup: false,
});
assert.deepEqual(
  applyConversationTopicUpdate(
    {
      recentTopics: ["드라마 추천"],
      exhaustedTopics: [],
      unresolvedTopics: ["내일 만남 계획"],
    },
    staleProposalCleanup
  ),
  {
    recentTopics: ["드라마 추천"],
    exhaustedTopics: [],
    unresolvedTopics: [],
  }
);

const assistantQuestion = {
  role: "assistant",
  content: "내일 볼까?",
  timestamp: Date.now() - 1000,
};
const acceptedProposal = extractCommitmentsFromTurn({
  userMessage: "좋아 만나자",
  assistantMessage: "좋지ㅋㅋ 내일 보자",
  recentMessages: [assistantQuestion],
});
assert.equal(acceptedProposal.length, 1);
assert.equal(acceptedProposal[0].title, "만날 약속");
assert.equal(acceptedProposal[0].dueLabel, "내일");

assert.deepEqual(
  extractCommitmentsFromTurn({
    userMessage: "로맨스 보면서 떡볶이나 먹고싶다~",
    assistantMessage: "로맨스 틀어놓고 떡볶이 먹으면 딱이지. 내일 만나면 그것도 코스에 넣을까?",
    recentMessages: [],
  }),
  []
);

const directUserPlan = extractCommitmentsFromTurn({
  userMessage: "내일 만나서 떡볶이 먹자",
  assistantMessage: "좋지",
  recentMessages: [],
});
assert.equal(directUserPlan.length, 1);
assert.equal(directUserPlan[0].title, "만날 약속");
assert.equal(directUserPlan[0].dueLabel, "내일");

assert.equal(isHypotheticalMeetupProposal("내일 만나면 떡볶이 먹자"), true);
assert.deepEqual(
  extractCommitmentsFromTurn({
    userMessage: "떡볶이 좋지",
    assistantMessage: "내일 만나면 떡볶이 먹자",
    recentMessages: [],
  }),
  []
);

const pendingMeetup = {
  id: "confirmed-tomorrow",
  title: "만날 약속",
  detail: "내일 만나기로 함",
  owner: "shared",
  dueLabel: "내일",
  status: "pending",
  sourceMessage: "내일 만나자",
  createdAt: Date.now() - 1000,
};
const existingMeetupFollowup = extractCommitmentsFromTurn({
  userMessage: "떡볶이 먹고 싶다",
  assistantMessage: "그럼 내일 만나서 먹자",
  recentMessages: [],
  existingCommitments: [pendingMeetup],
});
assert.equal(existingMeetupFollowup.length, 0);
const allowedExistingMeetupTopic = guardUnconfirmedMeetupTopics({
  currentState: EMPTY_CONVERSATION_TOPIC_STATE,
  update: {
    recentTopics: [],
    exhaustedTopics: [],
    unresolvedTopics: ["내일 만남 계획"],
    resolvedTopics: [],
  },
  hasConfirmedMeetup: true,
});
assert.deepEqual(allowedExistingMeetupTopic.unresolvedTopics, ["내일 만남 계획"]);

const yesterday = Date.now() - 24 * 60 * 60 * 1000;
const shiftedCommitmentHint = buildCommitmentPromptHint([
  {
    ...pendingMeetup,
    id: "tomorrow-becomes-today",
    createdAt: yesterday,
  },
]);
assert.match(shiftedCommitmentHint, /현재 기준 오늘/u);
assert.match(shiftedCommitmentHint, /당시 표현/u);

console.log("conversation topic tests: ok");
