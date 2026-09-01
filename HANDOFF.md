# 작업 핸드오프 — AI 연인 프로토타입 (이준)

> 이 세션에는 이전 대화 기록/메모리가 없어서, "지금까지 한 일"은 git 로그와
> `기획문서_AI연인프로토타입.md` / `README.md`에서 재구성했고, "앞으로 할 일"은
> 기획문서의 Could/Won't 항목 + README의 "알려진 한계"에서 추론한 것입니다.
> 구체적으로 잡아둔 백로그가 따로 있으면 이 문서의 "앞으로" 섹션을 교체하세요.

## 1. 제품 한 줄 요약

"대화를 끝낸 뒤에도 관계가 계속되는 AI 연인." 10년지기 남사친 "이준"과, 서로 아직
연애 감정을 말로 꺼낸 적 없는 썸 전 단계에서 시작. 검증하려는 가설:

> 사용자는 AI가 현재 메시지에 잘 답할 때보다, 지나간 시간·이전 대화·현재 감정을
> 이어서 행동할 때 "이 AI가 나를 신경 쓰고 있다"고 더 강하게 느낀다.

이 가설을 4개 장치로 증명: **Presence / Hidden Emotion / Memory / Event**.

## 2. 스택 / 아키텍처

- Next.js 14 (App Router) 단일 스택, TypeScript, Tailwind
- Anthropic `claude-sonnet-5` — SDK 없이 `fetch` + `tools` + 강제 `tool_choice`로
  JSON 1개 강제 (`lib/llm.ts`), 응답은 항상 Zod 검증 후에만 상태 반영 (`lib/schema.ts`)
- Supabase (service_role 전용, RLS deny-all, anon 키 미사용) — 익명 세션
  (`X-Session-Id` 헤더 + localStorage의 session_id만)
- Web Push (VAPID, `web-push`) + Service Worker (`public/sw.js`)
- 스케줄러는 로컬 스크립트 `scripts/reconnect-cron.mjs` (`npm run cron`)로만 검증,
  실제 배포용 Cron은 범위 밖

```
app/
  page.tsx                          카톡 스타일 채팅 UI, 이벤트 렌더링, 알림 구독 UX
  api/chat/route.ts                 GET=세션 부트스트랩/복원+재접속 먼저 말걸기, POST=대화 처리
  api/chat/call/route.ts            "전화하자" 통화 이벤트 처리
  api/session/name/route.ts         유저 이름/애칭 저장
  api/push/subscribe/route.ts       Web Push 구독 저장/삭제
  api/cron/reconnect-check/route.ts 백그라운드 트리거 (탭 닫혀 있어도 푸시)
lib/
  persona.ts    페르소나 텍스트 + 이름/웃음소리/고백 힌트 빌더
  mood.ts       Presence — 경과시간 + 직전 대화 분위기 + 관계 단계 → mood
  jealousy.ts   Hidden Emotion — 감정별 서브텍스트 힌트
  memory.ts     기억 후보 선별(키워드 겹침 + 최근성) + 프롬프트 힌트
  events.ts     Event — time_skip, 재접속 트리거, 삭제 메시지 힌트
  reconnect.ts  "재접속 시 먼저 말 걸기" 오케스트레이션 (GET/cron 공유)
  schema.ts     Zod 스키마 + 관계 점수→단계 텍스트 매핑 + 고백 임계값
  llm.ts        Anthropic 호출
  push.ts       web-push 래핑
  store.ts      Supabase 세션/메시지/기억/구독 저장
  supabase.ts   서버 전용 클라이언트 (지연 초기화)
db/migrations/  0001_init ~ 0005_confession
```

## 3. 지금까지 한 일 (git 히스토리 기준)

| 커밋 | 내용 |
|---|---|
| `93cc19c` | 초기 프로토타입 전체 — 4개 장치, Supabase 3테이블, Web Push, 로컬 cron, 채팅 UI |
| `1291f47` | 세션당 하루 메시지 한도 추가 (`lib/store.ts`, chat/route, chat/call/route) |
| `cf74f59` | Supabase 클라이언트 생성을 지연 초기화로 변경 (빌드/부팅 시 env 없어도 죽지 않게) |
| `262f810` | 모든 API 라우트에 최상위 try/catch 추가 |
| `1b3c134` | Next.js 14.2.5 → 14.2.35 보안 패치 |
| `07824f6` | **고백 엔딩 이벤트** — 관계 점수 ≥ 60이면 고백 수용, `confessed_at` 기록, 이후 "연인" 단계 고정 (`0005_confession.sql`) |

그 사이 마이그레이션으로 추가된 기능:
- `0003_user_name` — 유저 이름/애칭 (`user_name`), 모르면 이름 지어내지 않고 "너"
- `0004_call_event` — "전화하자" 이벤트 (`call_request` / `call_ended`)
- `0005_confession` — 고백 엔딩 (`confession_ending` 이벤트, `confessed_at`)

**현재 상태**: git clean, `main` 브랜치. 배포 안 됨(로컬 개발 전용).

### 관계 단계 (내부 점수 → 텍스트, 숫자는 UI 비노출)
- `< 20` 오래된 친구 / `≥ 20` 요즘 유독 편해진 친구 / `≥ 40` 친구라고 하기엔 조금 이상한 사이
- 고백 임계값 `≥ 60` → 고백 수용 가능 / 고백 후 "연인" 고정

### 감정 enum
`neutral / missing / jealous / hurt / affectionate / awkward` (매 턴 LLM structured output)

## 4. 앞으로 할 일 (추론 — 우선순위 미확정)

### 기획문서 Could 항목 중 미구현
- [ ] "입력하다 멈춤" 이벤트 (실시간 스트리밍/폴링 인프라 필요 → 이번 범위에서 제외됐던 것)
- [ ] 페르소나 프리셋 (여러 캐릭터 성격)
- [ ] 세션 초기화 버튼 (UI에서 대화 리셋)
- [ ] 여러 기기 이어하기 (현재는 localStorage session_id라 기기 간 불가)
- [ ] 추가 관계 시나리오

### README "알려진 한계" 중 개선 여지
- [ ] 기억 검색을 키워드 겹침+최근성 → 임베딩/벡터 검색으로 (필요성 재검토 후)
- [ ] 실제 배포용 스케줄러 (Vercel Cron 등)로 `scripts/reconnect-cron.mjs` 교체
- [ ] 감정/이벤트 판단의 재현성 (같은 상황에서 매번 다르게 나옴) — 프롬프트 튜닝 or few-shot 보강

### 운영/견고성 (최근 커밋 방향으로 볼 때 이어질 만한 것)
- [ ] 배포 (Vercel + Supabase) 및 env 정리
- [ ] Rate limit / 남용 방지 (현재는 세션당 하루 메시지 한도만)
- [ ] 에러 모니터링/로깅
- [ ] `security-review` 한 번 돌리기 (service_role 키 취급, CRON_SECRET 검증 등)

### 데모 완성도
- [ ] 데모 시나리오(3 Scene)가 한 번에 자연스럽게 이어지는지 실플레이 검증
- [ ] 고백 엔딩 이후 UX (엔딩 카드, 그 다음 대화 톤)

## 5. 로컬 실행

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
                             # VAPID 키 3종, CRON_SECRET 채우기
# Supabase SQL Editor에서 db/migrations/*.sql 순서대로 실행
npm run dev                  # http://localhost:3000 (실제 Chrome/Safari, VS Code 내장 브라우저 X)
npm run cron                  # (선택) 백그라운드 푸시 테스트용
```

Presence 테스트: Supabase `sessions` 테이블에서 `last_active_at`을 과거로 수정 후 새로고침.
