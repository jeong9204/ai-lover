// 로컬 개발용 트리거. Next.js(next dev)에는 스케줄러가 없어서, 이 스크립트를 별도 터미널에서
// `npm run cron`으로 띄워두면 일정 간격마다 /api/cron/reconnect-check를 호출해준다.
// 배포 환경(Vercel 등)에서는 이 스크립트 대신 진짜 Cron Job이 같은 라우트를 호출하게 하면 된다.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, "..", ".env.local"), "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env.local이 없으면 이미 설정된 환경변수만 사용
  }
}

loadEnvLocal();

const BASE_URL = process.env.CRON_TARGET_URL ?? "http://localhost:3000";
const INTERVAL_MS = Number(process.env.CRON_INTERVAL_MS ?? 5 * 60 * 1000); // 기본 5분
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error("CRON_SECRET이 설정되지 않았습니다. .env.local을 확인하세요.");
  process.exit(1);
}

async function tick() {
  try {
    const res = await fetch(`${BASE_URL}/api/cron/reconnect-check`, {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    });
    const data = await res.json();
    console.log(`[${new Date().toISOString()}] checked=${data.checked ?? "?"} notified=${data.notified ?? "?"}`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] cron 호출 실패:`, err.message);
  }
}

console.log(`reconnect-cron 시작 — ${INTERVAL_MS / 1000}초마다 ${BASE_URL}/api/cron/reconnect-check 호출`);
tick();
setInterval(tick, INTERVAL_MS);
