-- LLM 토큰/비용 점검용 쿼리.
-- Supabase SQL Editor에서 필요한 select 블록만 실행해서 보면 된다.

-- 1) 오늘(KST) 전체 LLM 사용량
select
  count(*) as llm_response_count,
  coalesce(sum(input_tokens), 0) as input_tokens,
  coalesce(sum(output_tokens), 0) as output_tokens,
  coalesce(sum(total_tokens), 0) as total_tokens,
  coalesce(sum(estimated_cost_usd), 0)::numeric(12, 6) as estimated_cost_usd,
  coalesce(avg(estimated_cost_usd), 0)::numeric(12, 8) as avg_cost_per_response,
  (coalesce(avg(estimated_cost_usd), 0) * 50)::numeric(12, 6) as estimated_cost_per_50_responses
from messages
where estimated_cost_usd is not null
  and created_at >= ((now() at time zone 'Asia/Seoul')::date at time zone 'Asia/Seoul');

-- 2) 최근 50회 LLM 응답 비용
select
  count(*) as llm_response_count,
  coalesce(sum(input_tokens), 0) as input_tokens,
  coalesce(sum(output_tokens), 0) as output_tokens,
  coalesce(sum(total_tokens), 0) as total_tokens,
  coalesce(sum(estimated_cost_usd), 0)::numeric(12, 6) as total_cost_usd,
  coalesce(avg(estimated_cost_usd), 0)::numeric(12, 8) as avg_cost_per_response,
  (coalesce(avg(estimated_cost_usd), 0) * 50)::numeric(12, 6) as estimated_cost_per_50_responses
from (
  select input_tokens, output_tokens, total_tokens, estimated_cost_usd
  from messages
  where estimated_cost_usd is not null
  order by created_at desc, id desc
  limit 50
) recent;

-- 3) 세션별 누적 비용 상위 30개
select
  session_id,
  count(*) as llm_response_count,
  coalesce(sum(input_tokens), 0) as input_tokens,
  coalesce(sum(output_tokens), 0) as output_tokens,
  coalesce(sum(total_tokens), 0) as total_tokens,
  coalesce(sum(estimated_cost_usd), 0)::numeric(12, 6) as total_cost_usd,
  coalesce(avg(estimated_cost_usd), 0)::numeric(12, 8) as avg_cost_per_response,
  max(created_at) as last_llm_response_at
from messages
where estimated_cost_usd is not null
group by session_id
order by total_cost_usd desc
limit 30;

-- 4) 최근 LLM 응답 원본 확인
select
  id,
  session_id,
  role,
  model,
  input_tokens,
  output_tokens,
  total_tokens,
  estimated_cost_usd,
  created_at,
  left(content, 120) as content_preview
from messages
where estimated_cost_usd is not null
order by created_at desc, id desc
limit 50;
