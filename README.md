# 이준 — AI 연인 프로토타입

"대화를 끝낸 뒤에도 관계가 계속되는 AI 연인" 프로토타입입니다. 10년지기 남사친이 서로 아직
연애 감정을 말로 꺼낸 적 없는 상태에서, 침묵과 감정을 이어받아 행동하는 걸 보여줍니다.
컨셉/기획 배경은 `기획문서_AI연인프로토타입.md`를 참고하세요.

## 구조

```
app/
  page.tsx                     카톡 스타일 채팅 UI — session_id 헤더 전송, 날짜 구분선/이벤트 렌더링, 알림 구독/초기화 UX
  layout.tsx                    메타데이터
  api/chat/route.ts            대화 처리 API — 세션 부트스트랩, Presence/Hidden Emotion/Memory/Event 조합
  api/push/subscribe/route.ts  브라우저 Web Push 구독 저장/삭제
  api/cron/reconnect-check/route.ts  백그라운드 트리거 — 탭이 닫혀 있어도 푸시 알림 발송
components/
  ChatHeader.tsx / MessageList.tsx / ChatInput.tsx / NamePrompt.tsx / CallOverlay.tsx
lib/
  persona.ts    캐릭터 페르소나 (10년지기 친구, 성격/말투 정의)
  mood.ts       Presence — 경과 시간 + 직전 대화 분위기 + 관계 단계 → mood 계산
  jealousy.ts   Hidden Emotion — 감정별 서브텍스트 힌트 + 키워드 보조 신호
  memory.ts     기억 후보 선별(키워드 겹침 + 최근성) / User·Relationship Memory 프롬프트 힌트 생성
  milestones.ts 관계 milestone 후보 생성 + memory type 추론
  daily-state.ts 하루 하나의 이준 생활 상태 생성 + 프롬프트 힌트 생성
  events.ts     Event — 재접속 트리거, 삭제 메시지 힌트, 통화 이벤트 라벨
  reconnect.ts  "재접속 시 먼저 말 걸기" 오케스트레이션 — GET /api/chat과 cron이 공유
  schema.ts     Zod 스키마(구조화 출력 검증) + 관계 점수 → 관계 단계 텍스트 매핑
  llm.ts        Anthropic API 호출 (fetch + tool_choice 강제, SDK 의존성 없음)
  push.ts       web-push 래핑 (VAPID 서명, 발송)
  store.ts      Supabase 기반 세션/구독 저장 (sessions/messages/memories/push_subscriptions)
  supabase.ts   서버 전용 Supabase 클라이언트 (service_role, 클라이언트 컴포넌트에서 import 금지)
public/sw.js    Service Worker — push 이벤트 수신 시 알림 표시
scripts/reconnect-cron.mjs   로컬 개발용 트리거 스크립트 (npm run cron)
db/migrations/  Supabase 스키마 (0001_init.sql ~ 0006_character_experience.sql)
```

`lib/` 아래 로직은 Next.js에 종속되지 않도록 순수 함수 위주로 작성했습니다.

## 실행 방법 (로컬)

```bash
npm install
cp .env.example .env.local
```

`.env.local`에 채워야 할 값:

- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase 프로젝트가 없다면 [supabase.com](https://supabase.com)에서
  무료로 새로 만든 뒤, SQL Editor에서 `db/migrations/*.sql`을 파일 번호 순서대로
  실행하세요. Project URL과 **service_role** 키(⚠️ `anon` 키 아님)는 Settings → API에서 확인합니다.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — `npx web-push generate-vapid-keys`로 생성
- `VAPID_SUBJECT` — `mailto:본인이메일` 형식이면 아무 값이나 가능
- `CRON_SECRET` — 임의의 비밀 문자열 (`openssl rand -hex 24` 등)
- `DEV_MODE_SECRET` — 개발자 모드 진입용 비밀 문자열. `/?dev=이값`으로 접속하면 이 브라우저에서
  리밋 우회/개발용 UI가 켜지고, `/?dev=off`로 끌 수 있습니다.

```bash
npm run dev
```

브라우저(⚠️ VS Code 내장 미리보기/Simple Browser 말고 실제 Chrome/Safari 등)에서 http://localhost:3000 접속.

### 백그라운드 알림까지 테스트하려면

탭/브라우저를 닫아도 캐릭터가 먼저 연락하면 실제 OS 알림이 오게 하려면, 별도 터미널에서:

```bash
npm run cron
```

`Next.js(next dev)` 자체엔 스케줄러가 없어서, 이 스크립트가 5분마다(`CRON_INTERVAL_MS`로 조절 가능)
`/api/cron/reconnect-check`를 호출해 "먼저 말 걸어야 하는 세션"을 확인하고 푸시를 보냅니다. 배포
환경(Vercel 등)에서는 이 스크립트 대신 같은 라우트를 호출하는 진짜 Cron Job으로 교체하면 됩니다.

브라우저에서 헤더의 🔕 아이콘을 눌러 알림을 구독한 뒤, `Supabase 대시보드 → sessions 테이블`에서
해당 세션의 `last_active_at`을 과거 시각으로 바꾸고 `npm run cron`이 한 바퀴 돌 때까지 기다리면
(또는 `curl -X POST localhost:3000/api/cron/reconnect-check -H "x-cron-secret: $CRON_SECRET"`으로
바로 트리거하면) 알림이 옵니다.

**알림이 안 뜬다면 체크리스트:**
- 실제 브라우저에서 열었는지 (VS Code 내장 브라우저는 Service Worker/Push API를 지원하지 않음)
- 시크릿 모드가 아닌지 (푸시 구독이 불안정함)
- macOS라면 **시스템 설정 → 알림 → Chrome(또는 사용 중인 브라우저)** 에서 알림이 켜져 있는지
  (브라우저 안에서 권한을 허용해도, macOS 시스템 알림이 꺼져 있으면 조용히 무시됩니다)
- 집중 모드(Focus/방해 금지)가 켜져 있지 않은지
- Brave 브라우저라면 `brave://settings/privacy`에서 "Use Google services for push messaging"을 켜야 함

## 데모 시나리오 재현 방법

1. 새 세션으로 처음 들어가면 빈 챗봇 화면 대신 이준이 먼저 보내둔 메시지로 시작합니다.
2. "내일 회사 동기랑 영화 보기로 했어ㅋㅋ" 같은 메시지를 보내 질투 반응(Hidden Emotion)과 메시지 삭제
   이벤트가 나오는지 확인합니다. (매 턴 LLM이 자율적으로 판단하므로 한 번에 안 나올 수 있습니다.)
3. Presence를 실제로 몇 시간 기다리지 않고 테스트하려면, Supabase 대시보드의 `sessions` 테이블에서
   해당 세션의 `last_active_at`을 과거 시각으로 수동으로 바꾼 뒤 새로고침해 보세요.
   재접속 먼저 말걸기(`reconnect_first_message`)가 나타납니다. 탭을 열어둔 채 기다리면(20초 간격
   폴링) 새로고침 없이도 같은 일이 일어납니다. 날짜가 바뀐 경우 구분선은 저장 이벤트가 아니라
   실제 메시지 timestamp 기준으로 화면에서만 표시됩니다.
4. 대화 중 "그 영화 보고 싶었는데" 같은 말을 흘려두고, 나중에 질투 상황을 만들어보면 캐릭터가 그
   기억을 지금 감정과 연결해서 꺼내는지 확인할 수 있습니다. 같은 기억은 간단한 중복 검사로 반복 저장을 줄입니다.
5. 질투/어색함/전화/고백/첫 선톡 같은 중요한 순간은 `relationship_milestones`에 중복 없이 기록됩니다.
6. 새로고침하거나 브라우저를 완전히 껐다 켜도 이전 대화/감정/관계 단계가 그대로 복원됩니다
   (`localStorage`의 `session_id` + Supabase 저장 덕분).
7. 개발자 모드에서만 보이는 "초기화"를 누르면 현재 브라우저의 익명 세션/이름 선택/푸시 구독을
   정리하고 새 대화를 시작합니다. 과거 Supabase 데이터는 데모 안전을 위해 서버에서 삭제하지 않습니다.

## 개발자 모드

회원가입 없이 개인 테스트용 리밋 우회와 개발용 UI를 켤 수 있습니다.

1. `.env.local`에 `DEV_MODE_SECRET`을 설정합니다.
2. 브라우저에서 `http://localhost:3000/?dev=DEV_MODE_SECRET값`으로 접속합니다.
3. URL의 `dev` 파라미터는 바로 지워지고, token은 이 브라우저의 localStorage에 저장됩니다.
4. 서버가 매 요청의 `x-dev-secret`을 검증해 맞을 때만 하루 메시지 제한을 우회합니다.
5. 개발자 모드를 끄려면 `http://localhost:3000/?dev=off`로 접속합니다.

일반 유저 화면에서는 초기화 버튼과 내부 mood가 보이지 않습니다.

## 알려진 한계 / 의도적으로 타협한 부분

기획문서 6장 "트레이드오프 / 리스크 관리 메모"에 정리되어 있습니다. 요약하면:

- 회원가입/로그인 없음 — `localStorage`의 익명 `session_id`로만 세션을 구분 (기기 간 이어하기는 안 됨)
- 기억 검색은 키워드 겹침 + 최근성 수준 (임베딩/벡터DB 아님)
- 감정 판단은 LLM structured output + Zod 검증으로 대체했지만, 여전히 확률적 판단이라 매번 동일하게
  재현되지는 않음 (예: 같은 강도의 질투 상황에서도 메시지 삭제 이벤트가 나올 때도, 안 나올 때도 있음)
- "입력하다 멈춤" 이벤트는 실시간 스트리밍 인프라(폴링/웹소켓)가 필요해 이번 범위에서 제외
- 실제 브라우저 푸시 알림은 구현했지만, 스케줄러(cron)는 로컬 스크립트(`scripts/reconnect-cron.mjs`)로
  대체 — 진짜 서비스라면 Vercel Cron 등 관리형 스케줄러로 교체 필요. 이 스크립트나 `npm run dev`가
  실행 중이지 않으면 백그라운드 알림은 오지 않음
