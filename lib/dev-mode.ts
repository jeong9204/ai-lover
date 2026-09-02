import { NextRequest } from "next/server";

export function isDeveloperRequest(req: NextRequest): boolean {
  const secret = process.env.DEV_MODE_SECRET;
  if (!secret) return false;
  return req.headers.get("x-dev-secret") === secret;
}
