// 서버 전용 Supabase 클라이언트. service_role 키는 RLS를 우회하므로
// 이 파일은 app/api/**/route.ts 등 서버 코드에서만 import해야 한다.
// 클라이언트 컴포넌트("use client")에서 절대 import하지 말 것.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// 모듈 로드 시점에 바로 client를 만들면, Next.js가 빌드 중 "Collecting page data" 단계에서
// 이 route 모듈을 평가할 때도 env var 검사가 실행돼서 빌드 자체가 실패한다 (실제로 겪은 문제).
// 그래서 실제로 호출될 때(요청 처리 시점)까지 생성을 미룬다 — lib/push.ts의 ensureConfigured()와 같은 패턴.
let cached: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (cached) return cached;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다. .env.local을 확인하세요."
    );
  }
  cached = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return cached;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
