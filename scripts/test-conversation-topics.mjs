import assert from "node:assert/strict";
import {
  applyConversationTopicUpdate,
  EMPTY_CONVERSATION_TOPIC_STATE,
  normalizeConversationTopicState,
} from "../lib/conversation-topics.ts";

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

console.log("conversation topic tests: ok");
