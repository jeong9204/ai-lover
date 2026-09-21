import { NextRequest, NextResponse } from "next/server";
import { isDeveloperRequest } from "@/lib/dev-mode";
import {
  buildProductAnalyticsSnapshot,
  type AnalyticsFeedbackRow,
  type AnalyticsMessageRow,
  type AnalyticsProductEventRow,
  type AnalyticsSessionRow,
} from "@/lib/product-analytics";
import { supabase } from "@/lib/supabase";

const MAX_SESSION_ROWS = 5000;
const MAX_MESSAGE_ROWS = 20000;
const MAX_EVENT_ROWS = 10000;
const MAX_FEEDBACK_ROWS = 5000;

function isMissingTable(error: unknown, tableName: string): boolean {
  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === "42P01" ||
    candidate.code === "PGRST205" ||
    new RegExp(`${tableName}.*(does not exist|could not find)`, "i").test(candidate.message ?? "") ||
    new RegExp(`could not find.*${tableName}`, "i").test(candidate.message ?? "")
  );
}

export async function GET(req: NextRequest) {
  if (!isDeveloperRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [sessionsResult, messagesResult, eventsResult, feedbackResult] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, relationship_stage, relationship_score, created_at, last_active_at")
      .order("created_at", { ascending: true })
      .limit(MAX_SESSION_ROWS),
    supabase
      .from("messages")
      .select("id, session_id, role, event_type, metadata, estimated_cost_usd, created_at")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(MAX_MESSAGE_ROWS),
    supabase
      .from("product_events")
      .select("id, session_id, event_name, event_data, dedupe_key, created_at")
      .order("created_at", { ascending: true })
      .limit(MAX_EVENT_ROWS),
    supabase
      .from("feedback_bonus_requests")
      .select("id, session_id, date_key, bonus_count, daily_message_count, created_at")
      .order("created_at", { ascending: true })
      .limit(MAX_FEEDBACK_ROWS),
  ]);

  if (sessionsResult.error || messagesResult.error || feedbackResult.error) {
    return NextResponse.json({ error: "제품 지표 데이터를 불러오지 못했어요." }, { status: 500 });
  }

  const analyticsMigrationReady = !eventsResult.error;
  if (eventsResult.error && !isMissingTable(eventsResult.error, "product_events")) {
    return NextResponse.json({ error: "제품 이벤트 데이터를 불러오지 못했어요." }, { status: 500 });
  }

  const snapshot = buildProductAnalyticsSnapshot({
    sessions: (sessionsResult.data ?? []) as AnalyticsSessionRow[],
    messages: (messagesResult.data ?? []) as AnalyticsMessageRow[],
    productEvents: analyticsMigrationReady
      ? ((eventsResult.data ?? []) as AnalyticsProductEventRow[])
      : [],
    feedbackRequests: (feedbackResult.data ?? []) as AnalyticsFeedbackRow[],
    analyticsMigrationReady,
  });

  return NextResponse.json({
    ...snapshot,
    dataScope: {
      sessions: sessionsResult.data?.length ?? 0,
      messages: messagesResult.data?.length ?? 0,
      productEvents: analyticsMigrationReady ? eventsResult.data?.length ?? 0 : 0,
      feedbackRequests: feedbackResult.data?.length ?? 0,
      truncated:
        (sessionsResult.data?.length ?? 0) >= MAX_SESSION_ROWS ||
        (messagesResult.data?.length ?? 0) >= MAX_MESSAGE_ROWS ||
        (eventsResult.data?.length ?? 0) >= MAX_EVENT_ROWS ||
        (feedbackResult.data?.length ?? 0) >= MAX_FEEDBACK_ROWS,
    },
  });
}
