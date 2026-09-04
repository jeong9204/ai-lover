-- 관계 약속/계획 기억:
-- "금요일 영화표는 유저가 잡고, 캐릭터가 맛집을 찾아오기로 했다"처럼
-- 일반 memories보다 오래 안정적으로 유지해야 하는 약속성 정보를 별도 저장한다.

create table if not exists relationship_commitments (
  id              bigint generated always as identity primary key,
  session_id      uuid not null references sessions(id) on delete cascade,
  title           text not null,
  detail          text,
  owner           text not null default 'shared'
                    check (owner in ('user','assistant','shared')),
  due_label       text,
  status          text not null default 'pending'
                    check (status in ('pending','done','cancelled')),
  source_message  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists relationship_commitments_session_status_idx
  on relationship_commitments (session_id, status, created_at);

alter table relationship_commitments enable row level security;
