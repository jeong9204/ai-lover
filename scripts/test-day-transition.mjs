import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const outputDirectory = mkdtempSync(join(tmpdir(), "ai-lover-day-transition-"));
execFileSync(
  "./node_modules/.bin/tsc",
  [
    "lib/korean-date.ts",
    "lib/conversation-topics.ts",
    "lib/day-transition.ts",
    "--outDir",
    outputDirectory,
    "--module",
    "commonjs",
    "--target",
    "ES2020",
    "--esModuleInterop",
    "--skipLibCheck",
    "--noEmitOnError",
    "false",
  ],
  { stdio: "inherit" }
);

const require = createRequire(import.meta.url);
const { computeNewDayTransition } = require(join(outputDirectory, "day-transition.js"));

const previousNight = Date.parse("2026-09-20T23:58:00+09:00");
const newDay = Date.parse("2026-09-21T00:03:00+09:00");
const baseTopicState = {
  recentTopics: ["드라마 추천"],
  exhaustedTopics: ["회사 업무 스트레스"],
  unresolvedTopics: ["친구와 싸운 고민"],
};

const jealousy = computeNewDayTransition(
  {
    lastConversationAt: previousNight,
    emotion: "jealous",
    emotionIntensity: 0.8,
    topicState: baseTopicState,
    milestones: [],
    memories: [],
  },
  newDay
);
assert.equal(jealousy?.emotionIntensity, 0.4);

const affection = computeNewDayTransition(
  {
    lastConversationAt: previousNight,
    emotion: "affectionate",
    emotionIntensity: 0.8,
    topicState: baseTopicState,
    milestones: [],
    memories: [],
  },
  newDay
);
assert.equal(affection?.emotionIntensity, 0.64);

const transientState = computeNewDayTransition(
  {
    lastConversationAt: previousNight,
    emotion: "neutral",
    emotionIntensity: 0.2,
    topicState: {
      recentTopics: ["지금 너무 졸림", "오늘 야근 피곤", "장기 수면 문제"],
      exhaustedTopics: [],
      unresolvedTopics: ["내일 깨워주기", "친구와 싸운 고민"],
    },
    milestones: [],
    memories: [],
  },
  newDay
);
assert.deepEqual(transientState?.topicState.recentTopics, ["회사 업무 스트레스", "수면 문제"]);
assert.deepEqual(transientState?.topicState.unresolvedTopics, ["친구와 싸운 고민"]);

const significantConflict = computeNewDayTransition(
  {
    lastConversationAt: previousNight,
    emotion: "awkward",
    emotionIntensity: 0.8,
    topicState: baseTopicState,
    milestones: [
      {
        type: "first_awkward_moment",
        createdAt: Date.parse("2026-09-20T22:00:00+09:00"),
      },
    ],
    memories: [],
  },
  newDay
);
assert.equal(significantConflict?.emotionIntensity, 0.56);

const repeated = computeNewDayTransition(
  {
    lastConversationAt: previousNight,
    emotion: jealousy?.emotion ?? "jealous",
    emotionIntensity: jealousy?.emotionIntensity ?? 0.4,
    topicState: jealousy?.topicState ?? baseTopicState,
    milestones: [],
    memories: [],
  },
  Date.parse("2026-09-21T00:20:00+09:00")
);
assert.equal(repeated, null);

const sameDay = computeNewDayTransition(
  {
    lastConversationAt: Date.parse("2026-09-21T00:01:00+09:00"),
    emotion: "jealous",
    emotionIntensity: 0.8,
    topicState: baseTopicState,
    milestones: [],
    memories: [],
  },
  newDay
);
assert.equal(sameDay, null);

console.log("new day transition tests: ok");
