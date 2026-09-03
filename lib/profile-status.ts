import type { PersonaType } from "./persona";
import type { CharacterDailyState } from "./store";

export function buildStatusMessage(
  personaType: PersonaType,
  mood: string,
  dailyState: CharacterDailyState | null
): string {
  if (dailyState?.thoughtAboutUser) return dailyState.thoughtAboutUser;

  if (mood === "missing") return "괜히 네 연락을 기다리는 중";
  if (mood === "hurt") return "조금 삐졌는데 티 안 내는 중";
  if (mood === "jealous") return "아무렇지 않은 척하는 중";

  if (personaType === "northern_duke") return "말은 짧아도 신경은 쓰는 중";
  if (personaType === "flirty") return "장난칠 타이밍 보는 중";
  return "별일 없는데 네 생각은 좀 나는 중";
}

export function buildTodayStatus(dailyState: CharacterDailyState | null): string {
  if (!dailyState) return "오늘은 아직 별다른 소식 없음";
  return dailyState.event ?? "오늘은 조용히 지나가는 중";
}

export function buildMoodLabel(mood: string): string {
  const labels: Record<string, string> = {
    calm: "평온",
    missing: "보고 싶어함",
    hurt: "살짝 서운함",
    jealous: "괜히 신경 쓰임",
    tired: "피곤함",
    restless: "뒤숭숭함",
    playful: "장난기 있음",
    quiet: "조용함",
    soft: "말랑함",
  };
  return labels[mood] ?? "평온";
}
