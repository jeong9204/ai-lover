-- 브라우저 Web Push 구독 정보. session_id당 여러 구독(여러 기기/브라우저)이 있을 수 있다.
-- endpoint는 브라우저/기기별로 고유하므로 unique로 중복 구독을 막는다.

create table if not exists push_subscriptions (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references sessions(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_session_idx on push_subscriptions (session_id);

alter table push_subscriptions enable row level security;
