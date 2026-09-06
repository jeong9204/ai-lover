import type { PersonaType } from "./persona";
import type { CharacterDailyState, Commitment } from "./store";

function pickStable<T>(items: readonly T[], seed: string): T {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return items[hash % items.length];
}

function isLoverStage(relationshipStage: string): boolean {
  return relationshipStage === "연인";
}

function commitmentStatus(commitments: Commitment[]): string | null {
  const pending = commitments.find((item) => item.status === "pending");
  if (!pending) return null;

  const text = `${pending.title} ${pending.detail ?? ""} ${pending.dueLabel ?? ""} ${pending.sourceMessage ?? ""}`;
  if (/영화|표|티켓|예매/u.test(text)) return `${pending.dueLabel ?? "약속"} 영화표 다시 확인하는 중`;
  if (/맛집|밥집|식당|카페|밥|먹/u.test(text)) return `${pending.dueLabel ?? "약속"} 어디 갈지 생각하는 중`;
  if (/내일|낼/u.test(text)) return "내일 만날 생각 중";
  if (/만나|보자|약속/u.test(text)) return `${pending.dueLabel ?? "다음 약속"} 생각 중`;
  return null;
}

export function buildStatusMessage(
  personaType: PersonaType,
  mood: string,
  dailyState: CharacterDailyState | null,
  relationshipStage = "",
  emotion = mood,
  emotionIntensity = 0,
  commitments: Commitment[] = []
): string {
  if (isLoverStage(relationshipStage)) {
    const pendingStatus = commitmentStatus(commitments);
    if (pendingStatus) return pendingStatus;

    if (emotion === "affectionate" && emotionIntensity >= 0.8) {
      return pickStable(
        [
          "오늘은 네가 좀 많이 보고 싶은 날",
          "네 답장 오면 바로 볼 예정",
          "괜히 말 걸고 싶은데 참고 있는 중",
          "자기 전까지 네 연락 볼 예정",
        ],
        `${relationshipStage}:${emotion}:${emotionIntensity}:${dailyState?.dateKey ?? ""}`
      );
    }

    return pickStable(
      [
        "별일 없는데 네 생각은 좀 나는 중",
        "답장 기다리는 거 티 안 내는 중",
        "괜히 네 이름 눌러보는 중",
        "오늘도 자연스럽게 네 생각 중",
      ],
      `${relationshipStage}:${personaType}:${dailyState?.dateKey ?? ""}`
    );
  }

  if (dailyState?.thoughtAboutUser) return dailyState.thoughtAboutUser;

  if (mood === "missing") return "괜히 네 연락을 기다리는 중";
  if (mood === "hurt") return "조금 삐졌는데 티 안 내는 중";
  if (mood === "jealous") return "아무렇지 않은 척하는 중";

  if (personaType === "northern_duke") return "말은 짧아도 신경은 쓰는 중";
  if (personaType === "flirty") return "장난칠 타이밍 보는 중";
  return "별일 없는데 네 생각은 좀 나는 중";
}

export function buildTodayStatus(
  dailyState: CharacterDailyState | null,
  relationshipStage = "",
  commitments: Commitment[] = []
): string {
  if (isLoverStage(relationshipStage)) {
    const pendingStatus = commitmentStatus(commitments);
    if (pendingStatus) return pendingStatus;
  }

  if (!dailyState) return "오늘은 아직 별다른 소식 없음";
  return dailyState.event ?? "오늘은 조용히 지나가는 중";
}

export function buildMoodLabel(mood: string): string {
  const labels: Record<string, string> = {
    calm: "평온",
    neutral: "평온",
    missing: "보고 싶어함",
    affectionate: "애정 가득",
    hurt: "살짝 서운함",
    jealous: "괜히 신경 쓰임",
    awkward: "묘하게 설렘",
    tired: "피곤함",
    restless: "뒤숭숭함",
    playful: "장난기 있음",
    quiet: "조용함",
    soft: "말랑함",
  };
  return labels[mood] ?? "평온";
}
