import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "./supabase";

interface RateLimitRule {
  bucket: string;
  limit: number;
  windowSeconds: number;
  label: string;
}

interface RateLimitRpcResult {
  allowed: boolean;
  remaining: number;
  reset_at: string;
}

function configuredNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    forwardedFor ??
    "unknown"
  );
}

function hashBucketPart(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

async function consumeRateLimit(rule: RateLimitRule): Promise<RateLimitRpcResult | null> {
  const { data, error } = await supabase.rpc("consume_api_rate_limit", {
    p_bucket: rule.bucket,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });

  if (error) return null;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) return null;
  return result as RateLimitRpcResult;
}

export async function checkLLMRateLimit(
  req: NextRequest,
  sessionId: string
): Promise<NextResponse | null> {
  const ipHash = hashBucketPart(clientIp(req));
  const sessionHash = hashBucketPart(sessionId);
  const rules: RateLimitRule[] = [
    {
      bucket: `llm:ip:${ipHash}:minute`,
      limit: configuredNumber("RATE_LIMIT_IP_PER_MINUTE", 20),
      windowSeconds: 60,
      label: "요청이 너무 빨라요. 잠시 후 다시 시도해 주세요.",
    },
    {
      bucket: `llm:session:${sessionHash}:minute`,
      limit: configuredNumber("RATE_LIMIT_SESSION_PER_MINUTE", 8),
      windowSeconds: 60,
      label: "대화가 너무 빠르게 이어지고 있어요. 잠깐만 쉬었다가 다시 보내주세요.",
    },
    {
      bucket: `llm:ip:${ipHash}:day`,
      limit: configuredNumber("RATE_LIMIT_IP_PER_DAY", 300),
      windowSeconds: 24 * 60 * 60,
      label: "오늘 이 네트워크에서 사용할 수 있는 대화량이 많아졌어요. 내일 다시 시도해 주세요.",
    },
  ];

  for (const rule of rules) {
    const result = await consumeRateLimit(rule);
    if (!result) continue;
    if (!result.allowed) {
      const resetAt = new Date(result.reset_at).getTime();
      const retryAfter = Number.isFinite(resetAt)
        ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
        : rule.windowSeconds;

      return NextResponse.json(
        { error: rule.label, retryAfterSeconds: retryAfter },
        { status: 429, headers: { "retry-after": String(retryAfter) } }
      );
    }
  }

  return null;
}
