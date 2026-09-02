import type { CharacterDailyState } from "./store";
import { koreanDateKey } from "./korean-date";

const moods = ["tired", "restless", "playful", "quiet", "soft"] as const;

const events = [
  "회사 일이 꼬여서 퇴근이 조금 늦었다.",
  "점심 먹으러 나갔다가 예전에 같이 갔던 골목을 지나쳤다.",
  "친구들이랑 별것 아닌 얘기를 하다가 네 생각이 났다.",
  "집에 오는 길에 새로 개봉한 영화 포스터를 봤다.",
  "하루 종일 정신없다가 밤이 돼서야 폰을 제대로 봤다.",
] as const;

const thoughts = [
  "네가 요즘 바쁘다고 했던 게 문득 생각났다.",
  "별일 없나 싶어서 먼저 말을 걸까 잠깐 고민했다.",
  "전에 네가 웃던 얘기가 생각나서 혼자 피식했다.",
  "괜히 뭐하나 궁금했는데 티 내기는 좀 머쓱했다.",
  "대화가 끊긴 게 조금 신경 쓰였다.",
] as const;

function hashText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function createCharacterDailyState(sessionId: string, dateKey = koreanDateKey()): CharacterDailyState {
  const seed = hashText(`${sessionId}:${dateKey}`);
  return {
    dateKey,
    mood: moods[seed % moods.length],
    event: events[Math.floor(seed / 7) % events.length],
    thoughtAboutUser: thoughts[Math.floor(seed / 13) % thoughts.length],
    createdAt: Date.now(),
  };
}

export function buildDailyStatePromptHint(state: CharacterDailyState | null): string {
  if (!state) return "";
  return `
[이준의 오늘]
아래 내용은 네가 오늘 실제로 겪은 배경이야. 그대로 설명하지 말고, 유저가 물어보거나 자연스럽게 어울릴 때
말투와 작은 언급으로만 묻어나게 해.
- 기분: ${state.mood}
- 오늘 있었던 일: ${state.event ?? "특별히 큰 일은 없었다."}
- 유저 생각: ${state.thoughtAboutUser ?? "문득 유저가 뭐 하는지 궁금했다."}
`.trim();
}
