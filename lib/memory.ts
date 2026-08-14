// 기획문서 2-3 "기억" 로직.
// 정교한 임베딩 검색 대신, 최근성 + 키워드 매칭 정도의 단순 규칙으로 구현했다.
// (알려진 한계: 의미적으로 유사하지만 키워드가 다른 기억은 회수되지 않음)

import { Memory } from "./store";

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
  const lines = memories.map((m) => `- ${m.text}`).join("\n");
  return `
너는 유저와의 지난 대화에서 아래 내용들을 기억하고 있어. 자연스러운 타이밍에, 너무 갑작스럽지 않게
관련 있으면 먼저 물어보거나 언급해줘 (매번 억지로 꺼낼 필요는 없어, 자연스러울 때만):
${lines}
`.trim();
}
