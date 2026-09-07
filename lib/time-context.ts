import { koreanHour } from "./korean-date";

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
  const sleepGuidance =
    hour >= 22 || hour < 6
      ? "늦은 시간이므로 자연스러울 때만 자러 가기, 쉬기, 내일을 위해 늦게까지 깨 있지 말기 같은 말을 해도 된다."
      : "아침/낮/저녁 초반에는 자라, 잘 준비해, 늦잠 자면 안 돼 같은 밤 대사를 하지 마. 대신 오늘 하루, 준비, 이동, 밥, 컨디션, 내일 약속 기대처럼 시간대에 맞는 말을 해.";

  return `
[현재 시간]
현재 한국 시간은 ${hour}시대이고, 시간대는 ${label}이야.
${sleepGuidance}
내일 약속이 있어도 현재 시간이 아침/낮이면 "잘 준비해"보다 "오늘 잘 보내고 내일 보자", "뭐 입을지 벌써 고민되네"처럼 현재 시간에 맞춰 말해.
`.trim();
}
