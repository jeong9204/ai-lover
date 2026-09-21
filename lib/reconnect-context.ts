import type { ConversationTopicState } from "./conversation-topics";

export type ReconnectPersonaType = "default" | "northern_duke" | "flirty";

interface GeneralReconnectPromptInput {
  topicState: ConversationTopicState;
  personaType: ReconnectPersonaType;
  isNewDay: boolean;
}

function topicKey(topic: string): string {
  return topic.replace(/[^\p{L}\p{N}]/gu, "").toLocaleLowerCase("ko-KR");
}

function isSameTopic(left: string, right: string): boolean {
  const leftKey = topicKey(left);
  const rightKey = topicKey(right);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;
  return (
    Math.min(leftKey.length, rightKey.length) >= 4 &&
    (leftKey.includes(rightKey) || rightKey.includes(leftKey))
  );
}

function availableFollowUpTopics(topicState: ConversationTopicState): string[] {
  const blocked = [...topicState.exhaustedTopics, ...topicState.unresolvedTopics];
  return topicState.recentTopics.filter(
    (topic) => !blocked.some((blockedTopic) => isSameTopic(topic, blockedTopic))
  );
}

function personaFreshPingExamples(personaType: ReconnectPersonaType): string {
  if (personaType === "northern_duke") {
    return '무뚝뚝한 말투는 유지하되 "뭐 하나." 또는 "문득 생각났다."처럼 짧게 시작할 수 있어.';
  }
  if (personaType === "flirty") {
    return '능글맞은 말투는 유지하되 "갑자기 네 생각나서ㅋㅋ 뭐해?"처럼 가볍게 시작할 수 있어.';
  }
  return '10년지기 말투는 유지하되 "뭐해ㅋㅋ" 또는 "갑자기 생각났어"처럼 가볍게 시작할 수 있어.';
}

export function buildGeneralReconnectPromptHint(input: GeneralReconnectPromptInput): string {
  const followUpTopics = input.isNewDay ? [] : availableFollowUpTopics(input.topicState);
  const mode = followUpTopics.length > 0 ? "context_follow_up" : "fresh_ping";
  const modeHint =
    mode === "context_follow_up"
      ? `최근 소재 중 자연스럽게 한 번 더 이어갈 수 있는 것은 ${followUpTopics
          .slice(-2)
          .map((topic) => `"${topic}"`)
          .join(", ")}야. 그중 하나에서 새로 떠오른 말이 있을 때만 짧게 이어가. 같은 질문이나 이미 한 말을 반복하지 마.`
      : `최근 대화를 억지로 되풀이하지 말고, 가벼운 새 연락으로 시작해. ${personaFreshPingExamples(
          input.personaType
        )}`;

  return `
[일반 선톡 / ${mode}]
이번 메시지는 유저의 부재를 확인하거나 평가하는 메시지가 아니라, 네가 자연스럽게 새로 말을 거는 메시지야.
${modeHint}
- 유저가 이전 메시지를 읽었거나 일부러 답하지 않았다고 추측하지 마. 유저에게 답장 의무가 있었다고 가정하지 마.
- 첫 문장은 유저의 침묵이 아니라 지금 새로 하고 싶은 말로 시작해.
- 한두 문장만 쓰고 질문은 1개를 권장하며 최대 2개를 넘기지 마.
- exhaustedTopics는 다시 꺼내지 마. unresolvedTopics도 이번 선톡의 이유로 억지로 꺼내지 마.
- "조용하네", "왜 답 없어", "왜 연락 안 해", "뭐하고 있었어", "사라졌네", "잠수탔네", "어디 갔어",
  "왜 이제 와", "바빴어?", "나 기다렸어", "기다렸잖아", "연락 없길래", "답이 없네", "무시하냐" 계열 표현을 쓰지 마.
- 유저가 답한 뒤에도 "그래서 답이 없었구나"처럼 직전 부재를 평가하지 말고 현재 답변 내용으로 정상 대화를 이어가.
`.trim();
}
