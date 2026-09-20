// Anthropic API 연동. SDK 의존성 없이 fetch로 직접 호출해서
// npm install 표면을 최소화했다 (기획문서 6장 스택 참고).
// 대사 생성 + 감정/관계/기억/이벤트 판단을 tool_choice로 강제한 구조화 출력 1회 호출로 받는다.

import { StructuredReplySchema, StructuredReply, EmotionEnum } from "./schema";
import { buildLLMTokenUsage, LLMTokenUsage } from "./llm-cost";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5";
const DEFAULT_MAX_TOKENS = 480;
const TOOL_NAME = "respond_in_character";

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

interface GenerateStructuredReplyOptions {
  maxTokens?: number;
}

export type StructuredReplyWithUsage = StructuredReply & {
  usage: LLMTokenUsage | null;
};

function resolveMaxTokens(override?: number): number {
  if (override) return override;
  const configured = Number(process.env.ANTHROPIC_MAX_TOKENS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_TOKENS;
}

export const STRUCTURED_OUTPUT_GUIDE = `
[응답 형식 안내]
너는 매 턴마다 아래 항목을 함께 채워야 해:
- message: 캐릭터로서 하는 실제 대사 (event가 deleted_message면 ""로 비워도 됨)
- emotion: 지금 느끼는 감정 (neutral/missing/jealous/hurt/affectionate/awkward 중 하나) —
  대사에서는 이 감정을 직접 말하지 말고 말투/행동으로만 드러내
- intensity: 그 감정의 세기 (0~1)
- relationshipDelta: 이번 턴이 관계에 준 영향 (-3~3, 아주 미묘한 변화 정도로만 사용, 웬만하면 -1~1)
- memory: 이번 대화에서 나중에도 챙길 만한 내용이 있으면 한 문장으로, 없으면 null
- event: 특별한 이유가 없으면 항상 null. 아래 두 경우에만 값을 채워:
  - 정말 캐릭터가 방금 자기 메시지를 지울 법한 순간(예: 질투/서운함을 참으려다 실수로 티 낸 직후)에는
    {"type":"deleted_message"}로 표시하고, 이때는 message를 ""로 비워.
  - 실제로 통화가 성사되는 순간에는 항상 {"type":"call_request"}로 표시해. 두 가지 경우 다 해당돼:
    (1) 텍스트로는 감정이 잘 안 풀릴 만큼 답답하거나 유저 목소리가 듣고 싶어질 만큼 감정이 고조돼서
    네가 먼저 전화하자고 제안할 때 (아주 가끔만, 남발하지 말 것), (2) 유저가 먼저 전화하자고 하거나
    전화하겠다고 했을 때 네가 좋다고 응하는 경우. 두 경우 모두 message에는 실제로 통화를 시작하게
    되는 대사를 넣어 (예: "그냥 잠깐 통화할래?", "어 콜, 지금 걸게 잠깐만"). 반대로 유저의 제안을
    거절하거나 애매하게 넘기는 대답이면 event는 null로 둬.
  - system prompt에 관계 확정/고백 허용 힌트가 있고, 유저가 이번 턴에 확실하게 사귀자고 고백하거나
    관계를 확정 짓는 질문에 답을 원하는 게 분명한데 네가 그걸 진심으로 받아들이는 경우에만
    {"type":"confession_ending"}으로 표시해. 이 힌트가 없거나 아직 확실한 고백이 아니면 이 이벤트를
    쓰지 마 — 그럴 땐 페르소나 기본 규칙대로 얼버무려.
  - 유저가 오늘/지금/곧 실제로 만나자고 제안했고, 네가 그 약속을 받아들이는 경우에만
    {"type":"meetup_request"}로 표시해. "언젠가 보자", "만나면 좋겠다" 같은 막연한 말이나
    네가 거절/보류하는 답이면 event는 null. 이 이벤트를 쓸 때 message는 카톡에서 약속을 잡는
    짧은 대사로만 써. 실제 만난 장면을 길게 연기하지 마.
    "내일 데이트 때 뭐 입을까", "장소 골라야겠다", "내일 보면 놀라겠다"처럼 미래 약속을 준비하거나
    기대하는 대화는 절대 meetup_request가 아니야. 그때는 event를 null로 두고 카톡 대화로만 답해.
    이미 만남 이벤트가 발생한 뒤 유저가 "씻고 나왔다", "문 잠갔다", "들어왔다", "도착했다"처럼
    현재 상태를 보고하는 말에는 절대 meetup_request를 다시 쓰지 마. 그때는 카톡 답장만 해.
  - 네가 먼저 "내일 볼까?", "만나면 좋겠다"라고 제안한 것만으로 약속이 확정된 게 아니야.
    유저가 "좋아", "그러자", "만나자"처럼 명확히 동의해야만 공유된 약속으로 취급해.
    "~면", "~하면", "~가면", "~먹으면", "~보면", "~할까?", "~하면 좋겠다"는 가정/제안이므로
    유저 확인 전에는 commitment나 unresolvedTopics에 넣지 마.
  - 음식, 드라마, 영화 같은 일상 화제를 습관적으로 만남 제안으로 확장하지 마. 유저가 만남 의도를 보이거나
    이미 확정된 pending 만남이 있을 때만 기존 약속과 자연스럽게 연결해.
- conversationState: 이번 턴에서 바뀐 대화 소재만 짧은 주제 단위로 분류해.
  Topic은 "이번 메시지의 내용 요약"이 아니라 "향후 대화에서 다시 참조할 가치가 있는 지속적인 대화 소재"야.
  - recentTopics: 이번 턴에서 새로 다룬 주요 소재. 문장 대신 "회사 업무 스트레스", "수면 문제"처럼 상위 주제로 써.
  - exhaustedTopics: 유저가 그만 이야기하고 싶다고 명시했거나, 충분히 다룬 뒤 명확히 마무리·전환된 소재만 넣어.
    한두 번 언급됐다는 이유로 exhausted 처리하지 마.
  - unresolvedTopics: 유저와 실제로 공유·확인했고 날짜/장소/결과/후속 확인이 아직 남아 있는 약속이나 고민.
    네가 혼자 말한 제안, 희망, 가정은 넣지 마.
  - resolvedTopics: 기존 미해결 소재 중 이번 턴에 확정·완료되어 더 추적할 필요가 없는 소재.
  각 배열은 이번 턴의 변경분만 넣고, 변화가 없으면 빈 배열로 둬.
  새 Topic을 만들기 전에 [대화 소재 상태]의 세 목록 전체와 의미상 같은 소재인지 먼저 판단해.
  같은 사건의 원인, 세부 상황, 진행 단계는 별도 Topic이 아니며 반드시 기존 명칭을 그대로 재사용해.
  예: "회사 힘든 일 상세", "팀장 수정 지시", "회사 수정 스트레스 마무리"는 모두 "회사 업무 스트레스" 하나야.
  Topic 이름에 "상세/마무리/언급/대화/이야기/질문/답변" 같은 메시지 상태 설명을 붙이지 마.
  "오랜만이야", "ㅋㅋㅋ", "뭐해?", "잘 잤어?", "말 왜 더듬어", "응", "졸려", "배고파" 같은
  인사·농담·반응·일회성 상태는 Topic으로 저장하지 마. 단, 며칠째 잠을 못 자거나 식사를 못 하는 것처럼
  지속적인 문제로 발전했다면 "수면 문제", "식사 문제"처럼 저장할 수 있어.
  서로 다른 지속 소재가 한 문장에 함께 있으면 각각 분리할 수 있어. 예: 회사 때문에 일주일째 잠을 못 잔다면
  "회사 업무 스트레스"와 "수면 문제"를 둘 다 기록할 수 있어.

[최신 메시지 우선]
- 항상 messages 배열의 마지막 user 메시지가 이번 턴의 진짜 요청이야. 이전 대화 분위기보다 이 메시지에 먼저 반응해.
- context 우선순위는 마지막 user 메시지 > 최근 흐름 > 감정/관계 > 관련 있는 미해결 소재 > 오래된 기억/요약 순서야.
- 미해결 소재가 있어도 마지막 user 메시지가 새 화제를 꺼냈다면 새 화제에 답하고, 관련 없는 미해결 소재는 언급하지 마.
- 마지막 user 메시지가 질문, 선택 요청, 추천 요청이면 첫 문장 안에서 그 질문에 직접 답해.
  예: "뭐 입고 갈까?", "어디 갈까?", "뭐 먹을까?", "언제 볼까?" 같은 말에는 농담만 하지 말고
  실제 추천/선택지를 하나는 줘.
- 직전 네 답장에 대한 장난이나 감정 반응은 최신 질문에 답한 뒤 짧게만 붙여. 최신 질문을 건너뛰면 안 돼.
- 과거 user 메시지의 특정 표현을 갑자기 다시 인용하거나 캐묻지 마. 예전 표현은 분위기 참고용이고,
  지금 마지막 user 메시지가 다시 꺼낸 게 아니라면 새 화제로 되살리지 마.

[대화 반복 방지]
- 최근 3턴 안에서 이미 나온 핵심 소재를 같은 방식으로 반복하지 마.
- 특히 밥/먹었냐/사줄게/걱정 같은 챙김 표현은 연속해서 중심 화제로 쓰지 마.
- 회사/일/업무/퇴근/바쁨을 기본 근황이나 대화 종료 핑계로 반복하지 마. 유저가 먼저 일 얘기를 꺼냈거나,
  현재 활동 힌트가 있을 때만 짧게 써. 그렇지 않으면 산책, 음악, 영화, 날씨, 집, 이동, 장난, 그리움,
  약속 준비 같은 다른 생활 디테일을 섞어.
- 이미 "그만해", "할 일 있다", "끝나면 연락할게"처럼 정리된 흐름은 다시 붙잡지 말고 짧게 받아넘겨.
- 유저가 같은 소재를 이어가더라도 한 번 받아준 뒤에는 감정, 상황, 장난, 짧은 침묵, 다른 생활 디테일 중
  하나로 자연스럽게 전환해.
- 매번 질문으로 끝내지 마. 유저가 대답할 의무가 없는 짧은 반응이나 감정이 살짝 묻은 대사도 섞어.
- 직전 네 답장과 비슷한 문장 구조(예: "그럼 뭐 해줄까", "다음에 만나면 사줄게", "왜 또 그런 말 해")를 반복하지 마.
`.trim();

export async function generateStructuredReply(
  systemPrompt: string,
  messages: LLMMessage[],
  options: GenerateStructuredReplyOptions = {}
): Promise<StructuredReplyWithUsage> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY가 설정되지 않았습니다. .env.local에 키를 추가하세요 (.env.example 참고)."
    );
  }

  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: resolveMaxTokens(options.maxTokens),
      system: systemPrompt,
      messages,
      tools: [
        {
          name: TOOL_NAME,
          description:
            "캐릭터의 실제 대사와 이번 턴의 감정/관계 변화/기억/이벤트 판단을 함께 반환한다.",
          input_schema: {
            type: "object",
            properties: {
              message: { type: "string" },
              emotion: { type: "string", enum: EmotionEnum.options },
              intensity: { type: "number" },
              relationshipDelta: { type: "integer" },
              memory: { type: ["string", "null"] },
              event: {
                anyOf: [
                  { type: "null" },
                  {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["deleted_message", "call_request", "confession_ending", "meetup_request"] },
                    },
                    required: ["type"],
                    additionalProperties: false,
                  },
                ],
              },
              conversationState: {
                type: "object",
                properties: {
                  recentTopics: {
                    type: "array",
                    items: { type: "string", minLength: 1, maxLength: 40 },
                    maxItems: 6,
                  },
                  exhaustedTopics: {
                    type: "array",
                    items: { type: "string", minLength: 1, maxLength: 40 },
                    maxItems: 6,
                  },
                  unresolvedTopics: {
                    type: "array",
                    items: { type: "string", minLength: 1, maxLength: 40 },
                    maxItems: 6,
                  },
                  resolvedTopics: {
                    type: "array",
                    items: { type: "string", minLength: 1, maxLength: 40 },
                    maxItems: 6,
                  },
                },
                required: ["recentTopics", "exhaustedTopics", "unresolvedTopics", "resolvedTopics"],
                additionalProperties: false,
              },
            },
            required: [
              "message",
              "emotion",
              "intensity",
              "relationshipDelta",
              "memory",
              "event",
              "conversationState",
            ],
            additionalProperties: false,
          },
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API 오류 (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const content: Array<{ type: string; input?: unknown }> = data?.content ?? [];
  const toolUse = content.find((block) => block.type === "tool_use");

  const parsed = StructuredReplySchema.safeParse(toolUse?.input);
  if (!parsed.success) {
    throw new Error("구조화 응답 검증에 실패했습니다. 다시 시도해주세요.");
  }
  if (!parsed.data.message && !parsed.data.event) {
    throw new Error("빈 응답을 받았습니다. 다시 시도해주세요.");
  }
  const usage = data?.usage
    ? buildLLMTokenUsage({
        model: typeof data.model === "string" ? data.model : model,
        inputTokens: Number(data.usage.input_tokens) || 0,
        outputTokens: Number(data.usage.output_tokens) || 0,
      })
    : null;
  return { ...parsed.data, usage };
}
