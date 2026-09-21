export interface AnalyticsSessionRow {
  id: string;
  relationship_stage: string;
  relationship_score: number;
  created_at: string;
  last_active_at: string | null;
}

export interface AnalyticsMessageRow {
  id: number;
  session_id: string;
  role: string;
  event_type: string | null;
  metadata: Record<string, unknown> | null;
  estimated_cost_usd: number | string | null;
  created_at: string;
}

export interface AnalyticsProductEventRow {
  id: number;
  session_id: string;
  event_name: string;
  event_data: Record<string, unknown> | null;
  dedupe_key: string;
  created_at: string;
}

export interface AnalyticsFeedbackRow {
  id: number;
  session_id: string;
  date_key: string;
  bonus_count: number;
  daily_message_count: number;
  created_at: string;
}

interface RetentionMetric {
  retained: number;
  eligible: number;
  rate: number;
}

interface SessionMetric {
  sessionId: string;
  firstActiveAt: string | null;
  lastActiveAt: string | null;
  totalUserMessages: number;
  totalAssistantMessages: number;
  currentRelationshipStage: string;
  relationshipScore: number;
  proactiveSentCount: number;
  proactiveRepliedCount: number;
  callCompletedCount: number;
  meetupCompletedCount: number;
  dailyLimitReachedCount: number;
  feedbackBonusClaimedCount: number;
  estimatedCostUsd: number;
  avgCostPerReply: number;
}

interface ProductAnalyticsInput {
  sessions: AnalyticsSessionRow[];
  messages: AnalyticsMessageRow[];
  productEvents: AnalyticsProductEventRow[];
  feedbackRequests: AnalyticsFeedbackRow[];
  analyticsMigrationReady: boolean;
  now?: number;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PROACTIVE_REPLY_WINDOW_MS = 6 * HOUR_MS;

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function kstDateKey(timestamp: number): string {
  return new Date(timestamp + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function dateOrdinal(dateKey: string): number {
  return Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / DAY_MS);
}

function dayDifference(fromDateKey: string, toDateKey: string): number {
  return dateOrdinal(toDateKey) - dateOrdinal(fromDateKey);
}

function safeRate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function groupBySession<T extends { session_id: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const values = grouped.get(row.session_id) ?? [];
    values.push(row);
    grouped.set(row.session_id, values);
  }
  return grouped;
}

function uniqueDays(messages: AnalyticsMessageRow[]): number {
  return new Set(messages.map((message) => kstDateKey(Date.parse(message.created_at)))).size;
}

function eventRows(
  events: AnalyticsProductEventRow[],
  eventName: string
): AnalyticsProductEventRow[] {
  return events.filter((event) => event.event_name === eventName);
}

function hasUserMessageWithin(
  userMessages: AnalyticsMessageRow[],
  startAt: number,
  endAt: number
): boolean {
  return userMessages.some((message) => {
    const timestamp = Date.parse(message.created_at);
    return timestamp > startAt && timestamp <= endAt;
  });
}

function buildRetention(
  firstActiveBySession: Map<string, number>,
  userDatesBySession: Map<string, Set<string>>,
  targetDay: number,
  todayKey: string
): RetentionMetric {
  let eligible = 0;
  let retained = 0;
  for (const [sessionId, firstActiveAt] of firstActiveBySession) {
    const firstDate = kstDateKey(firstActiveAt);
    if (dayDifference(firstDate, todayKey) < targetDay) continue;
    eligible += 1;
    const targetOrdinal = dateOrdinal(firstDate) + targetDay;
    const returned = [...(userDatesBySession.get(sessionId) ?? [])].some(
      (dateKey) => dateOrdinal(dateKey) === targetOrdinal
    );
    if (returned) retained += 1;
  }
  return { retained, eligible, rate: safeRate(retained, eligible) };
}

export function buildProductAnalyticsSnapshot(input: ProductAnalyticsInput) {
  const now = input.now ?? Date.now();
  const todayKey = kstDateKey(now);
  const productEvents = [...new Map(
    input.productEvents.map((event) => [
      `${event.session_id}:${event.event_name}:${event.dedupe_key}`,
      event,
    ])
  ).values()];
  const sortedMessages = [...input.messages].sort(
    (left, right) => Date.parse(left.created_at) - Date.parse(right.created_at) || left.id - right.id
  );
  const userMessages = sortedMessages.filter((message) => message.role === "user");
  const assistantMessages = sortedMessages.filter((message) => message.role === "assistant");
  const messagesBySession = groupBySession(sortedMessages);
  const userMessagesBySession = groupBySession(userMessages);
  const feedbackBySession = groupBySession(input.feedbackRequests);

  const firstActiveBySession = new Map<string, number>();
  const userDatesBySession = new Map<string, Set<string>>();
  for (const [sessionId, messages] of userMessagesBySession) {
    const timestamps = messages.map((message) => Date.parse(message.created_at));
    firstActiveBySession.set(sessionId, Math.min(...timestamps));
    userDatesBySession.set(
      sessionId,
      new Set(timestamps.map((timestamp) => kstDateKey(timestamp)))
    );
  }

  let proactiveSentCount = 0;
  let proactiveRepliedCount = 0;
  const proactiveBySession = new Map<string, { sent: number; replied: number }>();
  for (const [sessionId, messages] of messagesBySession) {
    let sent = 0;
    let replied = 0;
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      if (message.event_type !== "reconnect_first_message") continue;
      sent += 1;
      const sentAt = Date.parse(message.created_at);
      const nextProactiveIndex = messages.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex > index && candidate.event_type === "reconnect_first_message"
      );
      const searchEnd = nextProactiveIndex >= 0 ? nextProactiveIndex : messages.length;
      const didReply = messages.slice(index + 1, searchEnd).some(
        (candidate) =>
          candidate.role === "user" &&
          Date.parse(candidate.created_at) <= sentAt + PROACTIVE_REPLY_WINDOW_MS
      );
      if (didReply) replied += 1;
    }
    proactiveSentCount += sent;
    proactiveRepliedCount += replied;
    proactiveBySession.set(sessionId, { sent, replied });
  }

  const callStartedEvents = eventRows(productEvents, "call_started");
  const callCompletedEvents = input.analyticsMigrationReady
    ? eventRows(productEvents, "call_completed")
    : sortedMessages
        .filter((message) => message.event_type === "call_ended")
        .map((message) => ({
          id: message.id,
          session_id: message.session_id,
          event_name: "call_completed",
          event_data: {},
          dedupe_key: `message:${message.id}`,
          created_at: message.created_at,
        }));
  const meetupStartedEvents = input.analyticsMigrationReady
    ? eventRows(productEvents, "meetup_started")
    : sortedMessages
        .filter((message) => message.event_type === "meetup_request")
        .map((message) => ({
          id: message.id,
          session_id: message.session_id,
          event_name: "meetup_started",
          event_data: {},
          dedupe_key: `message:${message.id}`,
          created_at: message.created_at,
        }));
  const meetupCompletedEvents = input.analyticsMigrationReady
    ? eventRows(productEvents, "meetup_completed")
    : sortedMessages
        .filter((message) => message.event_type === "meetup_completed")
        .map((message) => ({
          id: message.id,
          session_id: message.session_id,
          event_name: "meetup_completed",
          event_data: {},
          dedupe_key: `message:${message.id}`,
          created_at: message.created_at,
        }));

  const completedCallsBySession = groupBySession(callCompletedEvents);
  const completedMeetupsBySession = groupBySession(meetupCompletedEvents);
  const limitKeys = new Set<string>();
  const validUsageBySessionDay = new Map<string, number>();
  for (const message of sortedMessages) {
    if (
      message.role === "user" &&
      message.metadata?.localReply !== true &&
      message.metadata?.limitBlocked !== true
    ) {
      const usageKey = `${message.session_id}:${kstDateKey(Date.parse(message.created_at))}`;
      validUsageBySessionDay.set(usageKey, (validUsageBySessionDay.get(usageKey) ?? 0) + 1);
    }
    if (message.event_type !== "limit_reached" && message.metadata?.limitBlocked !== true) continue;
    limitKeys.add(`${message.session_id}:${kstDateKey(Date.parse(message.created_at))}`);
  }
  for (const [usageKey, count] of validUsageBySessionDay) {
    if (count >= 30) limitKeys.add(usageKey);
  }

  const sessionMetrics: SessionMetric[] = input.sessions.map((session) => {
    const sessionMessages = messagesBySession.get(session.id) ?? [];
    const sessionUsers = userMessagesBySession.get(session.id) ?? [];
    const sessionAssistants = sessionMessages.filter((message) => message.role === "assistant");
    const usageMessages = sessionMessages.filter((message) => toNumber(message.estimated_cost_usd) > 0);
    const estimatedCostUsd = usageMessages.reduce(
      (sum, message) => sum + toNumber(message.estimated_cost_usd),
      0
    );
    const proactive = proactiveBySession.get(session.id) ?? { sent: 0, replied: 0 };
    const firstActiveAt = sessionUsers[0]?.created_at ?? null;
    const lastActiveAt = sessionUsers.at(-1)?.created_at ?? null;
    return {
      sessionId: session.id,
      firstActiveAt,
      lastActiveAt,
      totalUserMessages: sessionUsers.length,
      totalAssistantMessages: sessionAssistants.length,
      currentRelationshipStage: session.relationship_stage,
      relationshipScore: session.relationship_score,
      proactiveSentCount: proactive.sent,
      proactiveRepliedCount: proactive.replied,
      callCompletedCount: completedCallsBySession.get(session.id)?.length ?? 0,
      meetupCompletedCount: completedMeetupsBySession.get(session.id)?.length ?? 0,
      dailyLimitReachedCount: [...limitKeys].filter((key) => key.startsWith(`${session.id}:`)).length,
      feedbackBonusClaimedCount: feedbackBySession.get(session.id)?.length ?? 0,
      estimatedCostUsd,
      avgCostPerReply: safeRate(estimatedCostUsd, usageMessages.length),
    };
  });

  const activeToday = new Set(
    userMessages
      .filter((message) => kstDateKey(Date.parse(message.created_at)) === todayKey)
      .map((message) => message.session_id)
  ).size;
  const newSessionsToday = [...firstActiveBySession.values()].filter(
    (timestamp) => kstDateKey(timestamp) === todayKey
  ).length;

  const callReturnedWithin24h = callCompletedEvents.filter((event) =>
    hasUserMessageWithin(
      userMessagesBySession.get(event.session_id) ?? [],
      Date.parse(event.created_at),
      Date.parse(event.created_at) + DAY_MS
    )
  ).length;
  const meetupReturnedWithin24h = meetupCompletedEvents.filter((event) =>
    hasUserMessageWithin(
      userMessagesBySession.get(event.session_id) ?? [],
      Date.parse(event.created_at),
      Date.parse(event.created_at) + DAY_MS
    )
  ).length;

  const stageChangeEvents = eventRows(productEvents, "relationship_stage_changed");
  const stageNames = new Set([
    ...input.sessions.map((session) => session.relationship_stage),
    ...stageChangeEvents
      .map((event) => event.event_data?.to)
      .filter((stage): stage is string => typeof stage === "string"),
  ]);
  const relationshipStages = [...stageNames].map((stage) => {
    const transitions = stageChangeEvents.filter((event) => event.event_data?.to === stage);
    const messageCounts = transitions
      .map((event) => toNumber(event.event_data?.userMessageCount as number | string | null))
      .filter((value) => value > 0);
    const eligibleTransitions = transitions.filter(
      (event) => dayDifference(kstDateKey(Date.parse(event.created_at)), todayKey) >= 1
    );
    const nextDayReturns = eligibleTransitions.filter((event) => {
      const transitionDate = kstDateKey(Date.parse(event.created_at));
      return [...(userDatesBySession.get(event.session_id) ?? [])].some(
        (dateKey) => dayDifference(transitionDate, dateKey) === 1
      );
    }).length;
    return {
      stage,
      sessionCount: input.sessions.filter((session) => session.relationship_stage === stage).length,
      transitionCount: transitions.length,
      avgUserMessagesToEnter:
        messageCounts.length > 0
          ? messageCounts.reduce((sum, value) => sum + value, 0) / messageCounts.length
          : 0,
      nextDayReturnRate: safeRate(nextDayReturns, eligibleTransitions.length),
    };
  });

  const feedbackExposures = eventRows(productEvents, "feedback_bonus_exposed");
  const bonusMessagesUsed = input.feedbackRequests.reduce((total, feedback) => {
    const claimedAt = Date.parse(feedback.created_at);
    return (
      total +
      (userMessagesBySession.get(feedback.session_id) ?? []).filter(
        (message) =>
          Date.parse(message.created_at) > claimedAt &&
          kstDateKey(Date.parse(message.created_at)) === feedback.date_key &&
          message.metadata?.localReply !== true &&
          message.metadata?.limitBlocked !== true
      ).length
    );
  }, 0);

  const usageMessages = sortedMessages.filter((message) => toNumber(message.estimated_cost_usd) > 0);
  const totalCostUsd = usageMessages.reduce(
    (sum, message) => sum + toNumber(message.estimated_cost_usd),
    0
  );
  const costSessionCount = sessionMetrics.filter((session) => session.estimatedCostUsd > 0).length;
  const activeSessionCount = firstActiveBySession.size;

  return {
    generatedAt: new Date(now).toISOString(),
    browserRetentionNotice: "현재 retention은 익명 session_id 기반 브라우저 retention입니다.",
    analyticsMigrationReady: input.analyticsMigrationReady,
    overview: {
      sessions: input.sessions.length,
      activeToday,
      newSessionsToday,
      totalUserMessages: userMessages.length,
    },
    retention: {
      d1: buildRetention(firstActiveBySession, userDatesBySession, 1, todayKey),
      d3: buildRetention(firstActiveBySession, userDatesBySession, 3, todayKey),
      d7: buildRetention(firstActiveBySession, userDatesBySession, 7, todayKey),
    },
    engagement: {
      avgUserMessagesPerSession: safeRate(userMessages.length, activeSessionCount),
      proactiveSentCount,
      proactiveRepliedCount,
      proactiveReplyRate: safeRate(proactiveRepliedCount, proactiveSentCount),
      callStartedCount: callStartedEvents.length,
      callCompletedCount: callCompletedEvents.length,
      callCompletionRate: safeRate(
        Math.min(callCompletedEvents.length, callStartedEvents.length),
        callStartedEvents.length
      ),
      callReturnedWithin24h,
      callReturnWithin24hRate: safeRate(callReturnedWithin24h, callCompletedEvents.length),
      meetupStartedCount: meetupStartedEvents.length,
      meetupCompletedCount: meetupCompletedEvents.length,
      meetupCompletionRate: safeRate(
        Math.min(meetupCompletedEvents.length, meetupStartedEvents.length),
        meetupStartedEvents.length
      ),
      meetupReturnedWithin24h,
      meetupReturnWithin24hRate: safeRate(meetupReturnedWithin24h, meetupCompletedEvents.length),
    },
    monetization: {
      dailyLimitReachedOccurrences: limitKeys.size,
      dailyLimitReachedSessions: new Set([...limitKeys].map((key) => key.split(":")[0])).size,
      feedbackBonusExposedCount: feedbackExposures.length,
      feedbackBonusClaimedCount: input.feedbackRequests.length,
      feedbackBonusClaimRate: safeRate(input.feedbackRequests.length, feedbackExposures.length),
      bonusMessagesUsed,
    },
    cost: {
      responseCount: usageMessages.length,
      estimatedCostUsd: totalCostUsd,
      avgCostPerReply: safeRate(totalCostUsd, usageMessages.length),
      avgCostPerSession: safeRate(totalCostUsd, costSessionCount),
      avgDailyCost: safeRate(totalCostUsd, uniqueDays(usageMessages)),
      highestCostSessions: [...sessionMetrics]
        .filter((session) => session.estimatedCostUsd > 0)
        .sort((left, right) => right.estimatedCostUsd - left.estimatedCostUsd)
        .slice(0, 10),
    },
    relationshipStages,
    sessionMetrics: [...sessionMetrics]
      .sort((left, right) => right.totalUserMessages - left.totalUserMessages)
      .slice(0, 50),
  };
}
