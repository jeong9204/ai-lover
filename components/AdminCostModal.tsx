interface UsageSummary {
  responseCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  avgCostPerResponse: number;
  estimatedCostPer50Responses: number;
}

interface TopSessionSummary extends UsageSummary {
  sessionId: string;
  lastResponseAt: string | null;
}

interface RecentResponse {
  id: number;
  sessionId: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number;
  createdAt: string;
  preview: string;
}

export interface AdminCostData {
  generatedAt: string;
  sampledRowCount: number;
  maxUsageRows: number;
  today: UsageSummary;
  recent50: UsageSummary;
  currentSession: UsageSummary;
  topSessions: TopSessionSummary[];
  recentResponses: RecentResponse[];
}

interface AdminCostModalProps {
  open: boolean;
  data: AdminCostData | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(value));
}

function formatUsd(value: number, digits = 6) {
  return `$${value.toFixed(digits)}`;
}

function SummaryCard({ title, summary }: { title: string; summary: UsageSummary }) {
  return (
    <section className="rounded-lg bg-gray-50 p-3">
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-gray-500">응답 수</dt>
          <dd className="font-semibold text-gray-900">{formatNumber(summary.responseCount)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">총 비용</dt>
          <dd className="font-semibold text-gray-900">{formatUsd(summary.estimatedCostUsd)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">입력 토큰</dt>
          <dd className="font-semibold text-gray-900">{formatNumber(summary.inputTokens)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">출력 토큰</dt>
          <dd className="font-semibold text-gray-900">{formatNumber(summary.outputTokens)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">1회 평균</dt>
          <dd className="font-semibold text-gray-900">{formatUsd(summary.avgCostPerResponse, 8)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">50회 예상</dt>
          <dd className="font-semibold text-gray-900">{formatUsd(summary.estimatedCostPer50Responses)}</dd>
        </div>
      </dl>
    </section>
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
      <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-gray-900">LLM 비용</h2>
            <p className="text-[11px] text-gray-500">
              {data ? `최근 ${formatNumber(data.sampledRowCount)}개 기준` : "토큰 사용량 확인"}
            </p>
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

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {loading && <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">불러오는 중...</p>}
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {data && (
            <>
              <SummaryCard title="오늘 전체" summary={data.today} />
              <SummaryCard title="최근 50회" summary={data.recent50} />
              <SummaryCard title="현재 세션" summary={data.currentSession} />

              <section className="rounded-lg bg-gray-50 p-3">
                <h3 className="text-sm font-bold text-gray-900">비용 높은 세션</h3>
                <div className="mt-2 space-y-2">
                  {data.topSessions.length === 0 && <p className="text-xs text-gray-500">아직 비용 데이터가 없어요.</p>}
                  {data.topSessions.map((session) => (
                    <div key={session.sessionId} className="rounded-md bg-white p-2 text-xs">
                      <p className="truncate font-semibold text-gray-800">{session.sessionId}</p>
                      <p className="mt-1 text-gray-500">
                        {formatNumber(session.responseCount)}회 · {formatNumber(session.totalTokens)}토큰 ·{" "}
                        {formatUsd(session.estimatedCostUsd)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg bg-gray-50 p-3">
                <h3 className="text-sm font-bold text-gray-900">최근 응답</h3>
                <div className="mt-2 space-y-2">
                  {data.recentResponses.map((response) => (
                    <div key={response.id} className="rounded-md bg-white p-2 text-xs">
                      <p className="text-gray-500">
                        {formatUsd(response.estimatedCostUsd, 8)} · {formatNumber(response.totalTokens ?? 0)}토큰
                      </p>
                      <p className="mt-1 line-clamp-2 text-gray-800">{response.preview}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
