// 기획문서 2-3 "기억" 로직.
// 정교한 임베딩 검색 대신, 최근성 + 키워드 매칭 정도의 단순 규칙으로 구현했다.
// (알려진 한계: 의미적으로 유사하지만 키워드가 다른 기억은 회수되지 않음)

import { Memory } from "./store";

const MEETUP_PREPARATION_MEMORY_PATTERN =
  /(만나기로|만날\s*약속|보자고|보기로|데이트\s*(약속|준비)|몇\s*시에|어디서\s*볼|갈\s*곳|장소\s*(정|고르)|늦지|지각|입을\s*옷|뭐\s*입고)/u;

export function isMeetupPreparationMemoryText(text: string): boolean {
  return MEETUP_PREPARATION_MEMORY_PATTERN.test(text);
}

export function excludeCompletedMeetupPreparationMemories(
  memories: Memory[],
  completedAt: number | null
): Memory[] {
  if (completedAt === null) return memories;
  return memories.filter(
    (memory) =>
      memory.createdAt > completedAt || !isMeetupPreparationMemoryText(memory.text)
  );
}

/**
 * 현재 유저 메시지와 관련 있어 보이는 기억을 최대 2개까지 골라 반환.
 * 최근 3일 이내 + 아직 최근에 언급 안 한 기억을 우선한다.
 */
export function pickRelevantMemories(memories: Memory[], userMessage: string, max = 2): Memory[] {
  const now = Date.now();
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

  const candidates = memories.filter((m) => now - m.createdAt < THREE_DAYS * 4); // 최대 12일까지 후보

  // 키워드 겹침 기반 스코어링 (아주 단순한 버전)
  const userTokens = new Set(userMessage.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean));

  const scored = candidates.map((m) => {
    const memTokens = m.text.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);
    const overlap = memTokens.filter((t) => userTokens.has(t)).length;
    const recencyBonus = m.lastMentionedAt === null ? 1 : 0; // 아직 안 꺼낸 기억 우선
    const ageDays = (now - m.createdAt) / (24 * 60 * 60 * 1000);
    const spontaneousChance = ageDays > 0.5 && ageDays < 5 ? 0.3 : 0; // 며칠 지난 기억은 먼저 꺼낼 후보
    return { memory: m, score: overlap * 2 + recencyBonus + spontaneousChance };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .filter((s) => s.score > 0)
    .slice(0, max)
    .map((s) => s.memory);
}

export function buildMemoryPromptHint(memories: Memory[]): string {
  if (memories.length === 0) return "";
  const lines = memories
    .map((m) => `- ${m.type === "relationship" ? "[둘 사이의 기억]" : "[유저 기억]"} ${m.text}`)
    .join("\n");
  return `
너는 유저와의 지난 대화에서 아래 내용들을 기억하고 있어. 마지막 user 메시지의 현재 화제가 최우선이야.
현재 메시지와 직접 관련 있을 때만 자연스럽게 참고하고, 관련 없는 새 화제에는 먼저 꺼내거나 질문하지 마:
${lines}
`.trim();
}

export function pickSpontaneousMemory(memories: Memory[]): Memory | null {
  const now = Date.now();
  const recent = memories
    .filter((m) => now - m.createdAt < 14 * 24 * 60 * 60 * 1000)
    .sort((a, b) => {
      const typeBonus = Number(b.type === "relationship") - Number(a.type === "relationship");
      if (typeBonus !== 0) return typeBonus;
      return b.createdAt - a.createdAt;
    });
  return recent[0] ?? null;
}
