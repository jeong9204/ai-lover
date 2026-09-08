import { NextRequest, NextResponse } from "next/server";
import { isDeveloperRequest } from "@/lib/dev-mode";
import { supabase } from "@/lib/supabase";

const MAX_USAGE_ROWS = 5000;

interface UsageRow {
  id: number;
  session_id: string;
  role: string;
  content: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | string | null;
  created_at: string;
}

interface UsageSummary {
  responseCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  avgCostPerResponse: number;
  estimatedCostPer50Responses: number;
}

function startOfTodayKST(): Date {
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  const kstNow = new Date(Date.now() + kstOffsetMs);
  const kstMidnight = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate());
  return new Date(kstMidnight - kstOffsetMs);
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function summarize(rows: UsageRow[]): UsageSummary {
  const responseCount = rows.length;
  const inputTokens = rows.reduce((sum, row) => sum + toNumber(row.input_tokens), 0);
  const outputTokens = rows.reduce((sum, row) => sum + toNumber(row.output_tokens), 0);
  const totalTokens = rows.reduce((sum, row) => sum + toNumber(row.total_tokens), 0);
  const estimatedCostUsd = rows.reduce((sum, row) => sum + toNumber(row.estimated_cost_usd), 0);
  const avgCostPerResponse = responseCount > 0 ? estimatedCostUsd / responseCount : 0;

  return {
    responseCount,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd,
    avgCostPerResponse,
    estimatedCostPer50Responses: avgCostPerResponse * 50,
  };
}

export async function GET(req: NextRequest) {
  if (!isDeveloperRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sessionId = req.headers.get("x-session-id");
  const { data, error } = await supabase
    .from("messages")
    .select("id, session_id, role, content, model, input_tokens, output_tokens, total_tokens, estimated_cost_usd, created_at")
    .not("estimated_cost_usd", "is", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MAX_USAGE_ROWS);

  if (error) {
    return NextResponse.json({ error: "비용 데이터를 불러오지 못했어요." }, { status: 500 });
  }

  const rows = (data ?? []) as UsageRow[];
  const todayStart = startOfTodayKST().getTime();
  const todayRows = rows.filter((row) => new Date(row.created_at).getTime() >= todayStart);
  const recentRows = rows.slice(0, 50);
  const sessionRows = sessionId ? rows.filter((row) => row.session_id === sessionId) : [];

  const sessions = new Map<string, UsageRow[]>();
  rows.forEach((row) => {
    const sessionRowsForId = sessions.get(row.session_id) ?? [];
    sessionRowsForId.push(row);
    sessions.set(row.session_id, sessionRowsForId);
  });

  const topSessions = [...sessions.entries()]
    .map(([id, usageRows]) => ({ sessionId: id, ...summarize(usageRows), lastResponseAt: usageRows[0]?.created_at ?? null }))
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
    .slice(0, 10);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    sampledRowCount: rows.length,
    maxUsageRows: MAX_USAGE_ROWS,
    today: summarize(todayRows),
    recent50: summarize(recentRows),
    currentSession: summarize(sessionRows),
    topSessions,
    recentResponses: recentRows.slice(0, 10).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      model: row.model,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      totalTokens: row.total_tokens,
      estimatedCostUsd: toNumber(row.estimated_cost_usd),
      createdAt: row.created_at,
      preview: row.content.slice(0, 80),
    })),
  });
}
