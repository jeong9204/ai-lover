import assert from "node:assert/strict";
import { buildProductAnalyticsSnapshot } from "../lib/product-analytics.ts";

const at = (day, time) => `2026-09-${String(day).padStart(2, "0")}T${time}+09:00`;
const sessionId = "11111111-1111-4111-8111-111111111111";

const sessions = [
  {
    id: sessionId,
    relationship_stage: "연인",
    relationship_score: 65,
    created_at: at(1, "08:00:00"),
    last_active_at: at(8, "09:00:00"),
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    relationship_stage: "오래된 친구",
    relationship_score: 0,
    created_at: at(2, "08:00:00"),
    last_active_at: null,
  },
];

const messages = [
  { id: 1, session_id: sessionId, role: "user", event_type: null, metadata: null, estimated_cost_usd: null, created_at: at(1, "09:00:00") },
  { id: 2, session_id: sessionId, role: "assistant", event_type: "reconnect_first_message", metadata: null, estimated_cost_usd: "0.01000000", created_at: at(1, "10:00:00") },
  { id: 3, session_id: sessionId, role: "user", event_type: null, metadata: null, estimated_cost_usd: null, created_at: at(1, "10:30:00") },
  { id: 4, session_id: sessionId, role: "user", event_type: null, metadata: { limitBlocked: true }, estimated_cost_usd: null, created_at: at(1, "12:00:00") },
  { id: 5, session_id: sessionId, role: "user", event_type: null, metadata: null, estimated_cost_usd: null, created_at: at(1, "13:00:00") },
  { id: 6, session_id: sessionId, role: "user", event_type: null, metadata: null, estimated_cost_usd: null, created_at: at(2, "09:00:00") },
  { id: 7, session_id: sessionId, role: "user", event_type: null, metadata: null, estimated_cost_usd: null, created_at: at(4, "10:00:00") },
  { id: 8, session_id: sessionId, role: "assistant", event_type: null, metadata: null, estimated_cost_usd: 0.02, created_at: at(4, "10:00:01") },
  { id: 9, session_id: sessionId, role: "user", event_type: null, metadata: null, estimated_cost_usd: null, created_at: at(8, "09:00:00") },
];

const callCompleted = {
  id: 2,
  session_id: sessionId,
  event_name: "call_completed",
  event_data: { durationSec: 120 },
  dedupe_key: "call:call-0001",
  created_at: at(1, "11:00:00"),
};

const productEvents = [
  { id: 1, session_id: sessionId, event_name: "call_started", event_data: {}, dedupe_key: "call:call-0001", created_at: at(1, "10:58:00") },
  callCompleted,
  { ...callCompleted, id: 20 },
  { id: 3, session_id: sessionId, event_name: "meetup_started", event_data: {}, dedupe_key: "chat:meetup-1", created_at: at(4, "08:59:00") },
  { id: 4, session_id: sessionId, event_name: "meetup_completed", event_data: {}, dedupe_key: "chat:meetup-1", created_at: at(4, "09:00:00") },
  { id: 5, session_id: sessionId, event_name: "feedback_bonus_exposed", event_data: { dateKey: "2026-09-01" }, dedupe_key: "date:2026-09-01", created_at: at(1, "11:20:00") },
  { id: 6, session_id: sessionId, event_name: "relationship_stage_changed", event_data: { from: "친구라고 하기엔 조금 이상한 사이", to: "연인", userMessageCount: 4 }, dedupe_key: "chat:confession-1", created_at: at(1, "11:00:00") },
];

const feedbackRequests = [
  { id: 1, session_id: sessionId, date_key: "2026-09-01", bonus_count: 20, daily_message_count: 30, created_at: at(1, "12:30:00") },
];

const snapshot = buildProductAnalyticsSnapshot({
  sessions,
  messages,
  productEvents,
  feedbackRequests,
  analyticsMigrationReady: true,
  now: Date.parse(at(10, "12:00:00")),
});

assert.equal(snapshot.overview.sessions, 2);
assert.equal(snapshot.overview.totalUserMessages, 7);
assert.equal(snapshot.sessionMetrics[0].firstActiveAt, at(1, "09:00:00"));
assert.equal(snapshot.retention.d1.retained, 1);
assert.equal(snapshot.retention.d3.retained, 1);
assert.equal(snapshot.retention.d7.retained, 1);
assert.equal(snapshot.engagement.proactiveSentCount, 1);
assert.equal(snapshot.engagement.proactiveRepliedCount, 1);
assert.equal(snapshot.engagement.proactiveReplyRate, 1);
assert.equal(snapshot.engagement.callStartedCount, 1);
assert.equal(snapshot.engagement.callCompletedCount, 1);
assert.equal(snapshot.engagement.callReturnedWithin24h, 1);
assert.equal(snapshot.engagement.meetupStartedCount, 1);
assert.equal(snapshot.engagement.meetupCompletedCount, 1);
assert.equal(snapshot.engagement.meetupReturnedWithin24h, 1);
assert.equal(snapshot.monetization.dailyLimitReachedOccurrences, 1);
assert.equal(snapshot.monetization.feedbackBonusExposedCount, 1);
assert.equal(snapshot.monetization.feedbackBonusClaimedCount, 1);
assert.equal(snapshot.monetization.bonusMessagesUsed, 1);
assert.equal(snapshot.relationshipStages.find((item) => item.stage === "연인")?.avgUserMessagesToEnter, 4);
assert.equal(snapshot.relationshipStages.find((item) => item.stage === "연인")?.nextDayReturnRate, 1);
assert.equal(snapshot.cost.responseCount, 2);
assert.equal(snapshot.cost.estimatedCostUsd, 0.03);

const empty = buildProductAnalyticsSnapshot({
  sessions: [],
  messages: [],
  productEvents: [],
  feedbackRequests: [],
  analyticsMigrationReady: true,
  now: Date.parse(at(10, "12:00:00")),
});
assert.equal(empty.retention.d1.rate, 0);
assert.equal(empty.engagement.proactiveReplyRate, 0);
assert.equal(empty.monetization.feedbackBonusClaimRate, 0);
assert.equal(empty.cost.avgCostPerSession, 0);

console.log("product analytics tests: ok");
