// Event 로직 — 대사가 아니라 "행동"으로 관계가 이어지고 있다는 걸 보여주는 장치.
// deleted_message는 매 턴 LLM 구조화 출력의 event 필드로 이미 판단된다 (route.ts POST에서 처리).
// 여기서는 재접속 시 캐릭터가 먼저 말 걸지 판단하고, 그 트리거를 만든다.
// 경과 시간 자체는 Presence/mood 계산에만 쓰고, 화면의 날짜 구분은 실제 메시지 timestamp를
// 기준으로 클라이언트에서 렌더링한다.

import { MoodState } from "./mood";
import { PersonaType } from "./persona";

const HOUR = 60 * 60 * 1000;

/** Presence 상태가 평온(calm)이 아니면 캐릭터가 먼저 말 걸 조건이 충족된다. */
export function shouldSendReconnectMessage(moodState: MoodState): boolean {
  return moodState !== "calm";
}

/**
 * 재접속 트리거 — 실제 유저 발화가 없는 상태에서 캐릭터가 먼저 말 걸게 만드는 합성 user 턴.
 * 대화 기록에는 저장하지 않고, LLM 호출용 history의 마지막 항목으로만 잠깐 사용한다.
 */
export function buildReconnectTrigger(elapsedMs: number, moodState: MoodState): string {
  const hours = Math.max(1, Math.round(elapsedMs / HOUR));
  return (
    `[시스템: 유저가 ${hours}시간 만에 다시 대화창에 들어왔다. 유저는 아직 아무 말도 하지 않았다. ` +
    `지금 네 감정 상태(${moodState})에 맞게, 네가 먼저 말을 걸어라.]`
  );
}

export function formatCallDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 통화 종료 시 대화 중간에 넣는 구분선 라벨 (예: "통화 종료 · 1:24"). */
export function buildCallEndedLabel(durationSec: number): string {
  return `통화 종료 · ${formatCallDuration(durationSec)}`;
}

/**
 * 통화가 막 끝난 뒤 캐릭터가 먼저 텍스트로 말을 잇게 만드는 합성 user 턴.
 * reconnect 트리거와 마찬가지로 대화 기록에는 저장하지 않고 LLM 호출용 history에만 잠깐 쓴다.
 */
export function buildCallEndedTrigger(durationSec: number): string {
  const label = formatCallDuration(durationSec);
  return (
    `[시스템: 방금 유저와 ${label} 동안 전화 통화를 했고, 막 끊었다. ` +
    `통화에서 무슨 얘기를 했는지 자연스럽게 언급하거나 그 여운이 묻어나는 톤으로, ` +
    `다시 텍스트로 대화를 이어가라.]`
  );
}

export function buildMeetupCompletedLabel(): string {
  return "둘은 잠깐 만나고 돌아왔다";
}

export function buildMeetupReturnMessage(personaType: PersonaType): string {
  if (personaType === "northern_duke") {
    return "들어갔어?\n문 잠그고.";
  }
  if (personaType === "flirty") {
    return "집 잘 들어갔어?\n아까 헤어질 때 좀 아쉬웠지.";
  }
  return "집 들어갔어?\n아까 좀 재밌긴 했다.";
}

const EXPLICIT_MEETUP_REQUEST_PATTERN =
  /(만날래|만나자|보자|볼래|얼굴\s*볼|잠깐\s*볼|나와|나올래|와줄래|올래|데리러\s*(갈게|와|올래)|보러\s*(갈게|와|올래))/;

const MEETUP_FALSE_POSITIVE_PATTERN =
  /(씻고|샤워하고|문\s*잠|들어갔|들어왔|나왔|나왔다|도착|집\s*왔|집에\s*왔|퇴근했|누워|자려고)/;

export function isExplicitMeetupRequest(message: string): boolean {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!EXPLICIT_MEETUP_REQUEST_PATTERN.test(normalized)) return false;
  return !MEETUP_FALSE_POSITIVE_PATTERN.test(normalized);
}

/** 직전 턴에 삭제 이벤트가 있었다면, 다음 턴 system prompt에 한 줄로 접어 넣는다. */
export function recentDeletedMessageHint(hadRecentDeletedMessage: boolean): string {
  if (!hadRecentDeletedMessage) return "";
  return (
    "[참고] 방금 네가 메시지를 하나 삭제했어. 유저가 뭘 지웠냐고 물어보면 " +
    "얼버무리거나 머쓱해하며 넘어가, 굳이 먼저 설명하지는 마."
  );
}
