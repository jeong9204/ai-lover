import { NextRequest, NextResponse } from "next/server";
import { getOrCreateSession } from "@/lib/store";
import { koreanDateKey } from "@/lib/korean-date";
import { recordProductEvent } from "@/lib/product-events";

const EVENT_ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    eventName?: string;
    eventId?: string;
  };
  const result = await getOrCreateSession(req.headers.get("x-session-id"));
  if (result.status === "error") {
    return NextResponse.json({ error: "세션을 불러오지 못했어요." }, { status: 503 });
  }

  if (body.eventName === "call_started") {
    if (!body.eventId || !EVENT_ID_PATTERN.test(body.eventId)) {
      return NextResponse.json({ error: "올바른 eventId가 필요합니다." }, { status: 400 });
    }
    const status = await recordProductEvent({
      sessionId: result.session.id,
      eventName: "call_started",
      dedupeKey: `call:${body.eventId}`,
    });
    return NextResponse.json({ status });
  }

  if (body.eventName === "feedback_bonus_exposed") {
    const dateKey = koreanDateKey();
    const status = await recordProductEvent({
      sessionId: result.session.id,
      eventName: "feedback_bonus_exposed",
      dedupeKey: `date:${dateKey}`,
      eventData: { dateKey },
    });
    return NextResponse.json({ status });
  }

  return NextResponse.json({ error: "지원하지 않는 이벤트입니다." }, { status: 400 });
}
