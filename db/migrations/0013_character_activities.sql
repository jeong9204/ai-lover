-- 캐릭터 활동 상태:
-- "일 끝나고 연락할게"처럼 캐릭터가 잠깐 자리를 비우는 흐름을 저장해,
-- 그 시간 동안 재접속 선톡을 막고 프로필 상태에 생활감을 반영한다.

create table if not exists character_activities (
  id              bigint generated always as identity primary key,
  session_id      uuid not null references sessions(id) on delete cascade,
  type            text not null
                    check (type in ('busy_work')),
  title           text not null,
  detail          text,
  status          text not null default 'active'
                    check (status in ('active','done','cancelled')),
  starts_at       timestamptz not null default now(),
  ends_at         timestamptz not null,
  source_message  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists character_activities_session_status_idx
  on character_activities (session_id, status, ends_at);

alter table character_activities enable row level security;
