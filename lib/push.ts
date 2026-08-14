// Web Push 발송. VAPID 키는 서버 전용(VAPID_PRIVATE_KEY) — 클라이언트에는 공개 키만 노출한다.

import webpush from "web-push";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT;

let configured = false;
function ensureConfigured() {
  if (configured) return;
  if (!PUBLIC_KEY || !PRIVATE_KEY || !SUBJECT) {
    throw new Error("VAPID 키가 설정되지 않았습니다. .env.local을 확인하세요.");
  }
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** 구독이 만료/폐기됐으면(410/404) true를 반환 — 호출부가 DB에서 지울 수 있도록. */
export async function sendPushNotification(
  subscription: PushSubscriptionInput,
  payload: { title: string; body: string }
): Promise<{ expired: boolean }> {
  ensureConfigured();
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { expired: false };
  } catch (err) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      return { expired: true };
    }
    throw err;
  }
}
