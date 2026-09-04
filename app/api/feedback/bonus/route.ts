import { NextRequest, NextResponse } from "next/server";
import {
  countMessagesToday,
  getDailyMessageLimit,
  getOrCreateSession,
  saveFeedbackBonusRequest,
} from "@/lib/store";

const SESSION_LOAD_ERROR = "이전 대화를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";
const MIN_FEEDBACK_LENGTH = 10;
const MAX_FEEDBACK_LENGTH = 1000;

export async function POST(req: NextRequest) {
  try {
    const { content } = (await req.json()) as { content?: string };
    const trimmed = typeof content === "string" ? content.trim().slice(0, MAX_FEEDBACK_LENGTH) : "";
    if (trimmed.length < MIN_FEEDBACK_LENGTH) {
      return NextResponse.json({ error: "피드백을 10자 이상 적어주세요." }, { status: 400 });
    }

    const result = await getOrCreateSession(req.headers.get("x-session-id"));
    if (result.status === "error") {
      return NextResponse.json({ error: SESSION_LOAD_ERROR }, { status: 503 });
    }

    const dailyMessageCount = await countMessagesToday(result.session.id);
    const saved = await saveFeedbackBonusRequest(result.session, trimmed, dailyMessageCount);
    if (saved.status === "error") {
      return NextResponse.json({ error: "피드백 저장에 실패했어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
    }

    const dailyMessageLimit = await getDailyMessageLimit(result.session.id);
    return NextResponse.json({
      sessionId: result.session.id,
      status: saved.status,
      bonusCount: saved.bonusCount,
      dailyMessageCount,
      dailyMessageLimit,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "알 수 없는 오류" },
      { status: 500 }
    );
  }
}
