-- 오래된 빈 테스트 세션 정리용 SQL.
-- Supabase SQL Editor에서 먼저 DRY RUN 쿼리만 실행해 삭제 대상을 확인한 뒤,
-- 결과가 괜찮을 때만 아래 DELETE 쿼리의 주석을 풀어 실행한다.
--
-- 기준:
-- - 생성된 지 7일 이상 지남
-- - messages가 0개
-- - memories가 0개
-- - push_subscriptions가 0개
-- - character_daily_states는 있어도 삭제 허용 (sessions on delete cascade로 같이 정리됨)

-- DRY RUN: 삭제될 세션 수 확인
select count(*) as deletable_empty_sessions
from sessions s
where s.created_at < now() - interval '7 days'
  and not exists (select 1 from messages m where m.session_id = s.id)
  and not exists (select 1 from memories mem where mem.session_id = s.id)
  and not exists (select 1 from push_subscriptions p where p.session_id = s.id);

-- DRY RUN: 삭제될 세션 샘플 확인
select
  s.id,
  s.character_name,
  s.user_name,
  s.relationship_stage,
  s.created_at,
  s.updated_at
from sessions s
where s.created_at < now() - interval '7 days'
  and not exists (select 1 from messages m where m.session_id = s.id)
  and not exists (select 1 from memories mem where mem.session_id = s.id)
  and not exists (select 1 from push_subscriptions p where p.session_id = s.id)
order by s.created_at asc
limit 50;

-- EXECUTE: 위 결과를 확인한 뒤에만 주석을 풀어 실행
-- delete from sessions s
-- where s.created_at < now() - interval '7 days'
--   and not exists (select 1 from messages m where m.session_id = s.id)
--   and not exists (select 1 from memories mem where mem.session_id = s.id)
--   and not exists (select 1 from push_subscriptions p where p.session_id = s.id);
