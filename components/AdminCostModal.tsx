import type { ReactNode } from "react";

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

export interface AdminCostData {
  generatedAt: string;
  browserRetentionNotice: string;
  analyticsMigrationReady: boolean;
  overview: {
    sessions: number;
    activeToday: number;
    newSessionsToday: number;
    totalUserMessages: number;
  };
  retention: {
    d1: RetentionMetric;
    d3: RetentionMetric;
    d7: RetentionMetric;
  };
  engagement: {
    avgUserMessagesPerSession: number;
    proactiveSentCount: number;
    proactiveRepliedCount: number;
    proactiveReplyRate: number;
    callStartedCount: number;
    callCompletedCount: number;
    callCompletionRate: number;
    callReturnedWithin24h: number;
    callReturnWithin24hRate: number;
    meetupStartedCount: number;
    meetupCompletedCount: number;
    meetupCompletionRate: number;
    meetupReturnedWithin24h: number;
    meetupReturnWithin24hRate: number;
  };
  monetization: {
    dailyLimitReachedOccurrences: number;
    dailyLimitReachedSessions: number;
    feedbackBonusExposedCount: number;
    feedbackBonusClaimedCount: number;
    feedbackBonusClaimRate: number;
    bonusMessagesUsed: number;
  };
  cost: {
    responseCount: number;
    estimatedCostUsd: number;
    avgCostPerReply: number;
    avgCostPerSession: number;
    avgDailyCost: number;
    highestCostSessions: SessionMetric[];
  };
  relationshipStages: Array<{
    stage: string;
    sessionCount: number;
    transitionCount: number;
    avgUserMessagesToEnter: number;
    nextDayReturnRate: number;
  }>;
  sessionMetrics: SessionMetric[];
  dataScope: {
    sessions: number;
    messages: number;
    productEvents: number;
    feedbackRequests: number;
    truncated: boolean;
  };
}

interface AdminCostModalProps {
  open: boolean;
  data: AdminCostData | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: digits,
  }).format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatUsd(value: number, digits = 6) {
  return `$${value.toFixed(digits)}`;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-md border border-gray-200 bg-white px-3 py-2">
      <dt className="truncate text-[11px] text-gray-500">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-bold text-gray-900">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-bold text-gray-900">{title}</h3>
      {children}
    </section>
  );
}

function RetentionMetricView({ label, metric }: { label: string; metric: RetentionMetric }) {
  return (
    <Metric
      label={`${label} (${formatNumber(metric.retained)}/${formatNumber(metric.eligible)})`}
      value={formatPercent(metric.rate)}
    />
  );
}

export function AdminCostModal({
  open,
  data,
  loading,
  error,
  onClose,
  onRefresh,
}: AdminCostModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-gray-50 shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b bg-white px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-gray-900">제품 지표</h2>
            <p className="text-[11px] text-gray-500">행동, retention, 비용 요약</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              새로고침
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-1 text-2xl leading-none text-gray-900"
              aria-label="닫기"
            >
              ×
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {loading && <p className="rounded-md bg-white p-3 text-sm text-gray-600">불러오는 중...</p>}
          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {data && (
            <>
              {!data.analyticsMigrationReady && (
                <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                  `0019_product_analytics.sql` 적용 전이라 통화 시작, 관계 전환, 피드백 노출 지표는 아직 기록되지 않아요.
                </p>
              )}

              <Section title="전체">
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Sessions" value={formatNumber(data.overview.sessions)} />
                  <Metric label="Active Today" value={formatNumber(data.overview.activeToday)} />
                  <Metric label="New Today" value={formatNumber(data.overview.newSessionsToday)} />
                  <Metric label="User Messages" value={formatNumber(data.overview.totalUserMessages)} />
                </dl>
              </Section>

              <Section title="Retention">
                <dl className="grid grid-cols-3 gap-2">
                  <RetentionMetricView label="D1" metric={data.retention.d1} />
                  <RetentionMetricView label="D3" metric={data.retention.d3} />
                  <RetentionMetricView label="D7" metric={data.retention.d7} />
                </dl>
                <p className="mt-2 text-[11px] text-gray-500">{data.browserRetentionNotice}</p>
              </Section>

              <Section title="Engagement">
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Metric label="Avg User Msg / Session" value={formatNumber(data.engagement.avgUserMessagesPerSession, 1)} />
                  <Metric label="Proactive Reply" value={formatPercent(data.engagement.proactiveReplyRate)} />
                  <Metric label="Proactive Sent / Reply" value={`${data.engagement.proactiveSentCount} / ${data.engagement.proactiveRepliedCount}`} />
                  <Metric label="Call Start / Complete" value={`${data.engagement.callStartedCount} / ${data.engagement.callCompletedCount}`} />
                  <Metric label="Call Completion" value={formatPercent(data.engagement.callCompletionRate)} />
                  <Metric label="Call 24h Return" value={formatPercent(data.engagement.callReturnWithin24hRate)} />
                  <Metric label="Meetup Start / Complete" value={`${data.engagement.meetupStartedCount} / ${data.engagement.meetupCompletedCount}`} />
                  <Metric label="Meetup Completion" value={formatPercent(data.engagement.meetupCompletionRate)} />
                  <Metric label="Meetup 24h Return" value={formatPercent(data.engagement.meetupReturnWithin24hRate)} />
                </dl>
              </Section>

              <Section title="Relationship Funnel">
                <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
                  {data.relationshipStages.map((stage) => (
                    <div key={stage.stage} className="grid grid-cols-[1fr_auto] gap-3 border-b px-3 py-2 text-xs last:border-b-0">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-800">{stage.stage}</p>
                        <p className="mt-0.5 text-gray-500">
                          진입 평균 {formatNumber(stage.avgUserMessagesToEnter, 1)}회 · 다음날 {formatPercent(stage.nextDayReturnRate)}
                        </p>
                      </div>
                      <p className="font-bold text-gray-900">{formatNumber(stage.sessionCount)}</p>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Limit / Bonus">
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Metric label="Limit Reached" value={formatNumber(data.monetization.dailyLimitReachedOccurrences)} />
                  <Metric label="Limit Sessions" value={formatNumber(data.monetization.dailyLimitReachedSessions)} />
                  <Metric label="Bonus Exposed" value={formatNumber(data.monetization.feedbackBonusExposedCount)} />
                  <Metric label="Bonus Claimed" value={formatNumber(data.monetization.feedbackBonusClaimedCount)} />
                  <Metric label="Bonus Claim Rate" value={formatPercent(data.monetization.feedbackBonusClaimRate)} />
                  <Metric label="Messages After Bonus" value={formatNumber(data.monetization.bonusMessagesUsed)} />
                </dl>
              </Section>

              <Section title="Cost">
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Responses" value={formatNumber(data.cost.responseCount)} />
                  <Metric label="Total" value={formatUsd(data.cost.estimatedCostUsd)} />
                  <Metric label="Avg / Reply" value={formatUsd(data.cost.avgCostPerReply, 8)} />
                  <Metric label="Avg / Session" value={formatUsd(data.cost.avgCostPerSession, 8)} />
                  <Metric label="Avg Daily" value={formatUsd(data.cost.avgDailyCost, 8)} />
                </dl>
              </Section>

              <Section title="비용 높은 세션">
                <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
                  {data.cost.highestCostSessions.length === 0 && (
                    <p className="p-3 text-xs text-gray-500">아직 비용 데이터가 없어요.</p>
                  )}
                  {data.cost.highestCostSessions.map((session) => (
                    <div key={session.sessionId} className="border-b px-3 py-2 text-xs last:border-b-0">
                      <p className="truncate font-semibold text-gray-800">{session.sessionId}</p>
                      <p className="mt-0.5 text-gray-500">
                        user {formatNumber(session.totalUserMessages)}회 · {formatUsd(session.estimatedCostUsd)}
                      </p>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="메시지 많은 세션">
                <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
                  {data.sessionMetrics.slice(0, 10).map((session) => (
                    <div key={session.sessionId} className="grid grid-cols-[1fr_auto] gap-3 border-b px-3 py-2 text-xs last:border-b-0">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-800">{session.sessionId}</p>
                        <p className="mt-0.5 truncate text-gray-500">{session.currentRelationshipStage}</p>
                      </div>
                      <p className="font-bold text-gray-900">{formatNumber(session.totalUserMessages)}</p>
                    </div>
                  ))}
                </div>
              </Section>

              <p className="text-[11px] leading-relaxed text-gray-500">
                집계 범위: 세션 {formatNumber(data.dataScope.sessions)}, 메시지 {formatNumber(data.dataScope.messages)}, 이벤트 {formatNumber(data.dataScope.productEvents)}.
                {data.dataScope.truncated ? " 조회 상한에 도달해 일부 데이터만 집계됐습니다." : " 메시지 본문은 이 화면에서 조회하지 않습니다."}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
