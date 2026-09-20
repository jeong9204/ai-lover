import { KOREA_TIME_ZONE, koreanDateKey, koreanHour, koreanTime } from "./korean-date";

function timeLabel(hour: number): string {
  if (hour < 6) return "새벽";
  if (hour < 12) return "아침";
  if (hour < 17) return "낮";
  if (hour < 22) return "저녁";
  return "밤";
}

export function buildCurrentTimePromptHint(timestamp = Date.now()): string {
  const hour = koreanHour(timestamp);
  const label = timeLabel(hour);

  return `
[현재 시간]
현재 날짜: ${koreanDateKey(timestamp)}
현재 시간: ${koreanTime(timestamp)}
현재 시간대: ${KOREA_TIME_ZONE}
현재 시간 구간: ${label}

이 시간 정보는 말투와 생활감을 자연스럽게 조절하기 위한 참고값이지, 대화를 종료하라는 명령이 아니야.
밤이나 새벽이어도 유저가 새 화제를 꺼내거나 더 이야기하고 싶어 하면 그 화제를 자연스럽게 이어가.
유저가 직접 "졸려", "자야겠다", "이제 잘게"처럼 취침 의사를 밝혔을 때만 잘 자라는 답을 적극적으로 해.
시간이 늦다는 이유만으로 "이제 자", "내일 얘기하자", "컨디션 챙겨"를 반복하거나 건강을 훈계하지 마.
이미 한 번 잠을 권한 뒤 유저가 새 화제를 시작했다면, 현재 답변에서 수면이나 내일 일정을 다시 끌고 오지 마.
`.trim();
}
