-- LLM 비용 폭주 방지용 서버 API rate limit 저장소.
-- 클라이언트는 직접 접근하지 않고, 서버가 service_role로 RPC를 호출한다.

create table if not exists api_rate_limits (
  bucket      text primary key,
  count       integer not null default 0,
  reset_at    timestamptz not null,
  updated_at  timestamptz not null default now()
);

alter table api_rate_limits enable row level security;

create index if not exists api_rate_limits_reset_idx
  on api_rate_limits (reset_at);

create or replace function consume_api_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_reset_at timestamptz;
begin
  if p_bucket is null or p_bucket = '' or p_limit <= 0 or p_window_seconds <= 0 then
    return query select false, 0, now();
    return;
  end if;

  insert into api_rate_limits as limits (bucket, count, reset_at, updated_at)
  values (p_bucket, 1, now() + make_interval(secs => p_window_seconds), now())
  on conflict (bucket) do update set
    count = case
      when limits.reset_at <= now() then 1
      else limits.count + 1
    end,
    reset_at = case
      when limits.reset_at <= now() then now() + make_interval(secs => p_window_seconds)
      else limits.reset_at
    end,
    updated_at = now()
  returning limits.count, limits.reset_at into v_count, v_reset_at;

  return query select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_reset_at;
end;
$$;

-- 오래 지난 bucket 정리용. 필요할 때 Supabase SQL Editor에서 수동 실행하면 된다.
-- delete from api_rate_limits where reset_at < now() - interval '1 day';
