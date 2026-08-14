// 백그라운드 트리거 엔드포인트 — 브라우저 탭이 닫혀 있어도 캐릭터가 먼저 말 걸었다는 걸
// 실제 푸시 알림으로 보내기 위한 진입점. Next.js 자체엔 스케줄러가 없으므로, 로컬 개발에서는
// scripts/reconnect-cron.mjs가, 배포 환경(Vercel 등)에서는 Cron Job이 이 라우트를 주기적으로
// 호출하는 걸 전제로 한다. CRON_SECRET으로 보호해 아무나 호출하지 못하게 한다.

import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateSession,
  loadPushSubscriptions,
  deletePushSubscription,
  listSessionsNeedingPresenceCheck,
} from "@/lib/store";
import { attemptReconnect } from "@/lib/reconnect";
import { sendPushNotification } from "@/lib/push";
import { PERSONA_NAME } from "@/lib/persona";

const MIN_ELAPSED_MS = 30 * 60 * 1000; // Presence가 "calm"을 벗어날 수 있는 최소 시간(30분)과 맞춘다.

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sessionIds = await listSessionsNeedingPresenceCheck(MIN_ELAPSED_MS);
  let checked = 0;
  let notified = 0;

  for (const sessionId of sessionIds) {
    checked += 1;
    const result = await getOrCreateSession(sessionId);
    if (result.status === "error") continue;

    const reconnect = await attemptReconnect(result.session);
    if (!reconnect?.reconnectMessage) continue;

    const subscriptions = await loadPushSubscriptions(sessionId);
    for (const sub of subscriptions) {
      try {
        const { expired } = await sendPushNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          { title: PERSONA_NAME, body: reconnect.reconnectMessage.content }
        );
        if (expired) await deletePushSubscription(sub.endpoint);
        else notified += 1;
      } catch {
        // 개별 구독 발송 실패는 건너뛰고 다음 세션/구독을 계속 처리한다.
      }
    }
  }

  return NextResponse.json({ checked, notified });
}
