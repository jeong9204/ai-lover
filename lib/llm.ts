// Anthropic API 연동. SDK 의존성 없이 fetch로 직접 호출해서
// npm install 표면을 최소화했다 (기획문서 6장 스택 참고).
// 대사 생성 + 감정/관계/기억/이벤트 판단을 tool_choice로 강제한 구조화 출력 1회 호출로 받는다.

import { StructuredReplySchema, StructuredReply, EmotionEnum } from "./schema";

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
  - system prompt에 "[참고] 관계가 충분히 무르익었어..." 힌트가 있고, 유저가 이번 턴에 확실하게
    사귀자고 고백하거나 관계를 확정 짓는 질문에 답을 원하는 게 분명한데 네가 그걸 진심으로 받아들이는
    경우에만 {"type":"confession_ending"}으로 표시해. 이 힌트가 없거나 아직 확실한 고백이 아니면
    이 이벤트를 쓰지 마 — 그럴 땐 페르소나 기본 규칙대로 얼버무려.
  - 유저가 오늘/지금/곧 실제로 만나자고 제안했고, 네가 그 약속을 받아들이는 경우에만
    {"type":"meetup_request"}로 표시해. "언젠가 보자", "만나면 좋겠다" 같은 막연한 말이나
    네가 거절/보류하는 답이면 event는 null. 이 이벤트를 쓸 때 message는 카톡에서 약속을 잡는
    짧은 대사로만 써. 실제 만난 장면을 길게 연기하지 마.
    이미 만남 이벤트가 발생한 뒤 유저가 "씻고 나왔다", "문 잠갔다", "들어왔다", "도착했다"처럼
    현재 상태를 보고하는 말에는 절대 meetup_request를 다시 쓰지 마. 그때는 카톡 답장만 해.

[최신 메시지 우선]
- 항상 messages 배열의 마지막 user 메시지가 이번 턴의 진짜 요청이야. 이전 대화 분위기보다 이 메시지에 먼저 반응해.
- 마지막 user 메시지가 질문, 선택 요청, 추천 요청이면 첫 문장 안에서 그 질문에 직접 답해.
  예: "뭐 입고 갈까?", "어디 갈까?", "뭐 먹을까?", "언제 볼까?" 같은 말에는 농담만 하지 말고
  실제 추천/선택지를 하나는 줘.
- 직전 네 답장에 대한 장난이나 감정 반응은 최신 질문에 답한 뒤 짧게만 붙여. 최신 질문을 건너뛰면 안 돼.

[대화 반복 방지]
- 최근 3턴 안에서 이미 나온 핵심 소재를 같은 방식으로 반복하지 마.
- 특히 밥/먹었냐/사줄게/걱정 같은 챙김 표현은 연속해서 중심 화제로 쓰지 마.
- 유저가 같은 소재를 이어가더라도 한 번 받아준 뒤에는 감정, 상황, 장난, 짧은 침묵, 다른 생활 디테일 중
  하나로 자연스럽게 전환해.
- 매번 질문으로 끝내지 마. 유저가 대답할 의무가 없는 짧은 반응이나 감정이 살짝 묻은 대사도 섞어.
- 직전 네 답장과 비슷한 문장 구조(예: "그럼 뭐 해줄까", "다음에 만나면 사줄게")를 반복하지 마.
`.trim();

export async function generateStructuredReply(
  systemPrompt: string,
  messages: LLMMessage[],
  options: GenerateStructuredReplyOptions = {}
): Promise<StructuredReply> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY가 설정되지 않았습니다. .env.local에 키를 추가하세요 (.env.example 참고)."
    );
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
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
            },
            required: ["message", "emotion", "intensity", "relationshipDelta", "memory", "event"],
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
  return parsed.data;
}
