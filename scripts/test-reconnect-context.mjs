import assert from "node:assert/strict";
import { buildGeneralReconnectPromptHint } from "../lib/reconnect-context.ts";
import { buildEmotionPromptHint } from "../lib/jealousy.ts";
import { computeMood } from "../lib/mood.ts";

const emptyState = {
  recentTopics: [],
  exhaustedTopics: [],
  unresolvedTopics: [],
};

const freshPing = buildGeneralReconnectPromptHint({
  topicState: emptyState,
  personaType: "default",
  isNewDay: false,
});
assert.match(freshPing, /fresh_ping/u);
assert.match(freshPing, /뭐해ㅋㅋ/u);
assert.match(freshPing, /한두 문장/u);
assert.match(freshPing, /질문은 1개/u);
assert.match(freshPing, /답장 의무/u);
assert.match(freshPing, /"조용하네"/u);

const dramaFollowUp = buildGeneralReconnectPromptHint({
  topicState: {
    recentTopics: ["드라마 추천"],
    exhaustedTopics: [],
    unresolvedTopics: [],
  },
  personaType: "default",
  isNewDay: false,
});
assert.match(dramaFollowUp, /context_follow_up/u);
assert.match(dramaFollowUp, /"드라마 추천"/u);

const exhaustedDrama = buildGeneralReconnectPromptHint({
  topicState: {
    recentTopics: ["드라마 추천"],
    exhaustedTopics: ["드라마 추천"],
    unresolvedTopics: [],
  },
  personaType: "default",
  isNewDay: false,
});
assert.match(exhaustedDrama, /fresh_ping/u);

const unresolvedOnly = buildGeneralReconnectPromptHint({
  topicState: {
    recentTopics: [],
    exhaustedTopics: [],
    unresolvedTopics: ["내일 깨워주기"],
  },
  personaType: "default",
  isNewDay: false,
});
assert.match(unresolvedOnly, /fresh_ping/u);

const nextDay = buildGeneralReconnectPromptHint({
  topicState: {
    recentTopics: ["드라마 추천"],
    exhaustedTopics: [],
    unresolvedTopics: [],
  },
  personaType: "default",
  isNewDay: true,
});
assert.match(nextDay, /fresh_ping/u);

assert.match(
  buildGeneralReconnectPromptHint({
    topicState: emptyState,
    personaType: "northern_duke",
    isNewDay: false,
  }),
  /문득 생각났다/u
);
assert.match(
  buildGeneralReconnectPromptHint({
    topicState: emptyState,
    personaType: "flirty",
    isNewDay: false,
  }),
  /갑자기 네 생각나서ㅋㅋ 뭐해/u
);

const now = Date.parse("2026-09-21T20:00:00+09:00");
const pressurePattern = /조용하네|왜 이제 왔어|바빴어\?|답장이 없었|연락이 없었/u;
for (const elapsedHours of [0.5, 3, 12]) {
  const mood = computeMood(
    now - elapsedHours * 60 * 60 * 1000,
    { lastConversationMood: "neutral", relationshipStage: "연인" },
    now
  );
  assert.doesNotMatch(mood.promptHint, pressurePattern);
}

const missingEmotionHint = buildEmotionPromptHint("missing", 0.8);
assert.match(missingEmotionHint, /현재 유저의 말에 따뜻하게 반응/u);
assert.doesNotMatch(missingEmotionHint, /조용했어|답이 없었|연락이 없었/u);

console.log("reconnect context tests: ok");
