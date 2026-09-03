import type { ChatMessage } from "./store";
import type { LLMMessage } from "./llm";

const CHAT_HISTORY_LIMIT = 8;
const EVENT_HISTORY_LIMIT = 6;
const MAX_HISTORY_CONTENT_CHARS = 500;
const SUMMARY_LOOKBACK_LIMIT = 30;
const SUMMARY_ITEM_CHARS = 80;

function compactContent(content: string): string {
  const normalized = content.trim();
  if (normalized.length <= MAX_HISTORY_CONTENT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_HISTORY_CONTENT_CHARS)}...`;
}

function compactSummaryItem(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= SUMMARY_ITEM_CHARS) return normalized;
  return `${normalized.slice(0, SUMMARY_ITEM_CHARS)}...`;
}

function roleLabel(role: ChatMessage["role"]): string {
  if (role === "user") return "유저";
  if (role === "assistant") return "캐릭터";
  return "이벤트";
}

export function buildChatHistory(messages: ChatMessage[], nextUserMessage: string): LLMMessage[] {
  const history = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-CHAT_HISTORY_LIMIT)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: compactContent(m.content),
    }));

  history.push({ role: "user", content: compactContent(nextUserMessage) });
  return history;
}

export function buildEventHistory(messages: ChatMessage[], trigger: string): LLMMessage[] {
  const history = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-EVENT_HISTORY_LIMIT)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: compactContent(m.content),
    }));

  history.push({ role: "user", content: compactContent(trigger) });
  return history;
}

export function buildConversationSummaryHint(messages: ChatMessage[]): string | null {
  const recent = messages.slice(-SUMMARY_LOOKBACK_LIMIT);
  if (recent.length < 10) return null;

  const conversational = recent.filter((m) => m.role === "user" || m.role === "assistant");
  const recentUserMessages = conversational
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => compactSummaryItem(m.content));
  const recentAssistantMessages = conversational
    .filter((m) => m.role === "assistant")
    .slice(-2)
    .map((m) => compactSummaryItem(m.content));
  const recentEvents = recent
    .filter((m) => m.role === "system_event" || m.eventType)
    .slice(-2)
    .map((m) => `${roleLabel(m.role)}: ${compactSummaryItem(m.content)}`);

  const lines = [
    recentUserMessages.length > 0 ? `유저가 최근 꺼낸 말: ${recentUserMessages.join(" / ")}` : null,
    recentAssistantMessages.length > 0 ? `캐릭터의 최근 반응: ${recentAssistantMessages.join(" / ")}` : null,
    recentEvents.length > 0 ? `최근 있었던 일: ${recentEvents.join(" / ")}` : null,
  ].filter(Boolean);

  if (lines.length === 0) return null;
  return `
[최근 대화 요약]
아래는 전체 대화 기록을 다시 보내지 않기 위한 짧은 요약이야. 바로 직전 메시지 흐름을 우선하되,
분위기와 이어지는 맥락이 필요할 때만 참고해.
요약에 반복해서 등장한 소재를 그대로 되풀이하지 말고, 이미 충분히 다룬 화제라면 짧게 받아준 뒤
다른 감정/상황/생활 디테일로 자연스럽게 움직여:
${lines.map((line) => `- ${line}`).join("\n")}
`.trim();
}
