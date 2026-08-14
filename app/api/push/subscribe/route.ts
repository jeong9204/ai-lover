import { NextRequest, NextResponse } from "next/server";
import { savePushSubscription, deletePushSubscription } from "@/lib/store";

interface SubscribeBody {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
}

export async function POST(req: NextRequest) {
  const sessionId = req.headers.get("x-session-id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id가 필요합니다." }, { status: 400 });
  }

  const { subscription } = (await req.json()) as SubscribeBody;
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return NextResponse.json({ error: "구독 정보가 올바르지 않습니다." }, { status: 400 });
  }

  await savePushSubscription(sessionId, {
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { endpoint } = (await req.json()) as { endpoint: string };
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint가 필요합니다." }, { status: 400 });
  }
  await deletePushSubscription(endpoint);
  return NextResponse.json({ ok: true });
}
