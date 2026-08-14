-- AI-Lover: sessions / messages / memories 최소 스키마
-- 익명 session_id 기반, 로그인/회원가입 없음. RLS는 켜두고 정책은 만들지 않는다
-- (deny-all) — 서버는 오직 service_role 키로만 접근하며 이 키는 RLS를 우회한다.
-- anon 키는 이 프로젝트에서 전혀 사용/노출하지 않는다.

create extension if not exists pgcrypto;

create table if not exists sessions (
  id                      uuid primary key default gen_random_uuid(),
  relationship_stage      text not null default '오래된 친구',
  relationship_score      integer not null default 0,
  emotion                 text not null default 'neutral'
                            check (emotion in ('neutral','missing','jealous','hurt','affectionate','awkward')),
  emotion_intensity       numeric(3,2) not null default 0
                            check (emotion_intensity >= 0 and emotion_intensity <= 1),
  last_conversation_mood  text not null default 'neutral',
  last_active_at          timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table if not exists messages (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references sessions(id) on delete cascade,
  role        text not null check (role in ('user','assistant','system_event')),
  content     text not null,
  event_type  text check (event_type in ('deleted_message','time_skip','reconnect_first_message')),
  created_at  timestamptz not null default now()
);
create index if not exists messages_session_created_idx on messages (session_id, created_at);

create table if not exists memories (
  id            bigint generated always as identity primary key,
  session_id    uuid not null references sessions(id) on delete cascade,
  content       text not null,
  importance    numeric(3,2) not null default 0.5,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index if not exists memories_session_created_idx on memories (session_id, created_at);

alter table sessions enable row level security;
alter table messages enable row level security;
alter table memories enable row level security;
