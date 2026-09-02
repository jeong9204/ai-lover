-- 캐릭터 경험 확장:
-- - memory_type: 사용자 정보 기억과 관계 기억을 구분
-- - relationship_milestones: 관계 안에서 처음 발생한 중요한 사건 기록
-- - character_daily_states: 하루 하나의 이준 생활 상태

alter table memories
  add column if not exists memory_type text not null default 'user'
  check (memory_type in ('user','relationship'));

create table if not exists relationship_milestones (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references sessions(id) on delete cascade,
  type        text not null,
  title       text not null,
  description text,
  created_at  timestamptz not null default now(),
  unique (session_id, type)
);
create index if not exists relationship_milestones_session_created_idx
  on relationship_milestones (session_id, created_at);

create table if not exists character_daily_states (
  id                  bigint generated always as identity primary key,
  session_id          uuid not null references sessions(id) on delete cascade,
  date_key            text not null,
  mood                text not null,
  event               text,
  thought_about_user  text,
  created_at          timestamptz not null default now(),
  unique (session_id, date_key)
);
create index if not exists character_daily_states_session_date_idx
  on character_daily_states (session_id, date_key);

alter table relationship_milestones enable row level security;
alter table character_daily_states enable row level security;
