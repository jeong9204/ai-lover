import assert from "node:assert/strict";
import {
  buildExpiredClosurePromptHint,
  buildSleepClosureReconnectTrigger,
  conversationClosureFromMessages,
  detectConversationClosure,
  isFirstReconnectAfterSleepClosure,
  isConversationClosureActive,
} from "../lib/conversation-closure.ts";

const atKoreanTime = (iso) => Date.parse(`${iso}+09:00`);

const sleepAt = atKoreanTime("2026-09-21T01:20:00");
const sleepClosure = detectConversationClosure("나 이제 잘게 잘자", sleepAt);
assert.equal(sleepClosure?.reason, "sleep");
assert.equal(sleepClosure?.suppressProactiveUntil, atKoreanTime("2026-09-21T09:00:00"));
assert.equal(isConversationClosureActive(sleepClosure, atKoreanTime("2026-09-21T01:50:00")), true);
assert.equal(isConversationClosureActive(sleepClosure, atKoreanTime("2026-09-21T09:00:00")), false);

const messagesAfterReturn = [
  { role: "user", content: "나 이제 잘게 잘자", timestamp: sleepAt },
  { role: "assistant", content: "응 잘자ㅎㅎ 내일 봐~", timestamp: sleepAt + 1 },
  { role: "user", content: "아 근데 생각났는데", timestamp: sleepAt + 10 * 60 * 1000 },
];
assert.equal(conversationClosureFromMessages(messagesAfterReturn), null);

const nightGoodbye = detectConversationClosure("잘자 내일 봐", atKoreanTime("2026-09-20T23:30:00"));
assert.equal(nightGoodbye?.reason, "sleep");
assert.equal(nightGoodbye?.suppressProactiveUntil, atKoreanTime("2026-09-21T09:00:00"));
assert.match(buildExpiredClosurePromptHint(nightGoodbye), /무시당한 상황이 아니야/u);
const defaultHint = buildExpiredClosurePromptHint(nightGoodbye, "default");
assert.match(defaultHint, /한두 문장/u);
assert.match(defaultHint, /질문은 1개/u);
assert.match(defaultHint, /조용하네/u);
assert.match(defaultHint, /잘 잤냐ㅋㅋ/u);
assert.match(buildExpiredClosurePromptHint(nightGoodbye, "northern_duke"), /잘 잤나/u);
assert.match(buildExpiredClosurePromptHint(nightGoodbye, "flirty"), /꿈에 나왔냐/u);
assert.match(buildSleepClosureReconnectTrigger(), /답장할 의무도 없었다/u);

const beforeFirstReconnect = [
  { role: "user", content: "응 잘자~ 내일 봐", timestamp: sleepAt },
  { role: "assistant", content: "응 잘자ㅎㅎ", timestamp: sleepAt + 1 },
];
assert.equal(isFirstReconnectAfterSleepClosure(sleepClosure, beforeFirstReconnect), true);
assert.equal(
  isFirstReconnectAfterSleepClosure(sleepClosure, [
    ...beforeFirstReconnect,
    {
      role: "assistant",
      content: "잘 잤냐ㅋㅋ",
      timestamp: atKoreanTime("2026-09-21T09:10:00"),
      eventType: "reconnect_first_message",
    },
  ]),
  false
);

const busyAt = atKoreanTime("2026-09-21T18:00:00");
const busyClosure = detectConversationClosure("나 씻고 올게", busyAt);
assert.equal(busyClosure?.reason, "busy");
assert.equal(busyClosure?.suppressProactiveUntil, busyAt + 90 * 60 * 1000);
assert.equal(detectConversationClosure("나 잠깐 뭐 하고 올게", busyAt)?.reason, "busy");
assert.equal(detectConversationClosure("나 이따 올게", busyAt)?.reason, "busy");

assert.equal(detectConversationClosure("잘 자야 하는데 아직 잠 안 와", sleepAt), null);
assert.equal(detectConversationClosure("나중에 이 영화 같이 보고 싶다", sleepAt), null);
assert.equal(detectConversationClosure("이따 뭐 먹을까?", sleepAt), null);

const scheduledCallConversation = [
  { role: "user", content: "내일 9시에 전화해서 깨워줘", timestamp: sleepAt - 1000 },
  { role: "assistant", content: "알겠어", timestamp: sleepAt - 500 },
  { role: "user", content: "잘자", timestamp: sleepAt },
];
assert.equal(conversationClosureFromMessages(scheduledCallConversation)?.reason, "sleep");

console.log("conversation closure tests: ok");
