-- 피드백 보너스:
-- 일반 유저가 일일 한도에 도달했을 때 피드백을 남기면, 그날 세션 한도를 추가로 열어준다.
-- 피드백 분석을 위해 제출 당시의 세션 상태와 마지막 대화 일부를 함께 저장한다.

create table if not exists feedback_bonus_requests (
  id                      bigint generated always as identity primary key,
  session_id              uuid not null references sessions(id) on delete cascade,
  content                 text not null,
  bonus_count             integer not null default 20,
  date_key                text not null,
  daily_message_count     integer not null default 0,
  total_message_count     integer not null default 0,
  relationship_stage      text not null,
  relationship_score      integer not null,
  emotion                 text not null,
  emotion_intensity       numeric(3,2) not null,
  character_name          text,
  persona_type            text,
  last_user_message       text,
  last_assistant_message  text,
  last_event_type         text,
  created_at              timestamptz not null default now(),
  unique (session_id, date_key)
);

create index if not exists feedback_bonus_requests_session_created_idx
  on feedback_bonus_requests (session_id, created_at);

create index if not exists feedback_bonus_requests_date_idx
  on feedback_bonus_requests (date_key);

alter table feedback_bonus_requests enable row level security;
