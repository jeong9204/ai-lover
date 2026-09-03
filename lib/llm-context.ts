import type { ChatMessage } from "./store";
import type { LLMMessage } from "./llm";

const CHAT_HISTORY_LIMIT = 8;
const EVENT_HISTORY_LIMIT = 6;
const MAX_HISTORY_CONTENT_CHARS = 500;

function compactContent(content: string): string {
  const normalized = content.trim();
  if (normalized.length <= MAX_HISTORY_CONTENT_CHARS) return normalized;
  return `${normalized.slice(0, MAX_HISTORY_CONTENT_CHARS)}...`;
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
