-- MVP 제품 행동 계측.
-- 메시지 수/retention/선톡/한도/비용처럼 기존 테이블로 계산 가능한 값은 복제하지 않고,
-- 기존 데이터만으로 알 수 없거나 API 재시도 중복 방지가 필요한 lifecycle 이벤트만 저장한다.

create table if not exists product_events (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references sessions(id) on delete cascade,
  event_name  text not null check (
    event_name in (
      'relationship_stage_changed',
      'call_started',
      'call_completed',
      'meetup_started',
      'meetup_completed',
      'feedback_bonus_exposed'
    )
  ),
  event_data  jsonb not null default '{}'::jsonb,
  dedupe_key  text not null,
  created_at  timestamptz not null default now(),
  unique (session_id, event_name, dedupe_key)
);

create index if not exists product_events_session_created_idx
  on product_events (session_id, created_at);

create index if not exists product_events_name_created_idx
  on product_events (event_name, created_at);

alter table product_events enable row level security;

-- 기존 통화/만남 기록을 관리자 지표에 포함한다. 이후 이벤트는 애플리케이션이 request/call ID로 기록한다.
insert into product_events (session_id, event_name, event_data, dedupe_key, created_at)
select
  session_id,
  case event_type
    when 'call_ended' then 'call_completed'
    when 'meetup_request' then 'meetup_started'
    when 'meetup_completed' then 'meetup_completed'
  end,
  jsonb_build_object('legacyMessageId', id),
  'message:' || id::text,
  created_at
from messages
where event_type in ('call_ended', 'meetup_request', 'meetup_completed')
on conflict (session_id, event_name, dedupe_key) do nothing;

-- 과거 보너스 수령은 패널 노출 뒤 발생한 것으로 간주해 기존 claim이 분모 없이 남지 않게 한다.
insert into product_events (session_id, event_name, event_data, dedupe_key, created_at)
select
  session_id,
  'feedback_bonus_exposed',
  jsonb_build_object('dateKey', date_key, 'backfilledFromClaim', true),
  'date:' || date_key,
  created_at
from feedback_bonus_requests
on conflict (session_id, event_name, dedupe_key) do nothing;
