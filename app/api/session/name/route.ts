import { NextRequest, NextResponse } from "next/server";
import { getOrCreateSession, updateSession } from "@/lib/store";

const SESSION_LOAD_ERROR = "이전 대화를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";
const MAX_NAME_LENGTH = 20;

export async function POST(req: NextRequest) {
  try {
    const { name } = (await req.json()) as { name?: string };
    const trimmed = typeof name === "string" ? name.trim().slice(0, MAX_NAME_LENGTH) : "";
    if (!trimmed) {
      return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
    }

    const result = await getOrCreateSession(req.headers.get("x-session-id"));
    if (result.status === "error") {
      return NextResponse.json({ error: SESSION_LOAD_ERROR }, { status: 503 });
    }

    await updateSession(result.session.id, { userName: trimmed });

    return NextResponse.json({ sessionId: result.session.id, userName: trimmed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "알 수 없는 오류" },
      { status: 500 }
    );
  }
}
