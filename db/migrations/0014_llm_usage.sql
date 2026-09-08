-- LLM 호출별 토큰/비용 기록.
-- assistant 메시지와 LLM이 만든 일부 system_event(deleted_message)에 저장된다.
-- estimated_cost_usd는 "대화 당시 가격"으로 계산해서 저장하므로,
-- 나중에 모델 가격이 바뀌어도 과거 비용은 다시 계산하지 않는다.

alter table messages add column if not exists model text;
alter table messages add column if not exists input_tokens integer;
alter table messages add column if not exists output_tokens integer;
alter table messages add column if not exists total_tokens integer;
alter table messages add column if not exists estimated_cost_usd numeric(12, 8);

create index if not exists messages_llm_usage_created_idx
  on messages (created_at desc)
  where estimated_cost_usd is not null;

create index if not exists messages_session_llm_usage_idx
  on messages (session_id, created_at desc)
  where estimated_cost_usd is not null;
