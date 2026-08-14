// Event 로직 — 대사가 아니라 "행동"으로 관계가 이어지고 있다는 걸 보여주는 장치.
// deleted_message는 매 턴 LLM 구조화 출력의 event 필드로 이미 판단된다 (route.ts POST에서 처리).
// 여기서는 그 외 두 가지를 다룬다:
// - time_skip: LLM 호출 없이 순수 계산으로 만드는 "N분/N시간 후" 구분선.
// - reconnect_first_message: 재접속 시 캐릭터가 먼저 말 걸지 판단하고, 그 트리거를 만든다.
// 두 이벤트 모두 한 번 발생시키면 last_active_at이 "지금"으로 갱신되므로, 바로 다음 재접속에서는
// 경과 시간이 다시 0에 가까워져 자연스럽게 중복 삽입을 막는다 (별도 플래그 불필요).
// 단, 이 갱신은 실제로 뭔가 보여줄 게 있을 때만 일어나야 한다 — reconnect.ts가 claimReconnectSlot을
// "표시할 이벤트가 있다고 판단한 뒤에만" 호출하는 이유가 이것이다. 매 폴링마다 무조건 갱신해버리면
// 탭을 열어두고 자리를 비운 사이에도 경과 시간이 계속 리셋돼서 이 카드가 영영 안 뜬다.

import { MoodState } from "./mood";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const TIME_SKIP_THRESHOLD_MINUTES = 5;

/** 마지막 메시지로부터 충분히 지났으면(5분+) "N분 후"/"N시간 후" 구분선 카드 텍스트를 만든다. */
export function buildTimeSkipCard(elapsedMs: number): string | null {
  const minutes = Math.floor(elapsedMs / MINUTE);
  if (minutes < TIME_SKIP_THRESHOLD_MINUTES) return null;
  if (minutes < 60) return `${minutes}분 후`;
  return `${Math.floor(minutes / 60)}시간 후`;
}

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

/** 직전 턴에 삭제 이벤트가 있었다면, 다음 턴 system prompt에 한 줄로 접어 넣는다. */
export function recentDeletedMessageHint(hadRecentDeletedMessage: boolean): string {
  if (!hadRecentDeletedMessage) return "";
  return (
    "[참고] 방금 네가 메시지를 하나 삭제했어. 유저가 뭘 지웠냐고 물어보면 " +
    "얼버무리거나 머쓱해하며 넘어가, 굳이 먼저 설명하지는 마."
  );
}
