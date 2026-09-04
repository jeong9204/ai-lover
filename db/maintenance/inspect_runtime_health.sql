-- 운영 상태 점검용 읽기 전용 SQL.
-- Supabase Logs의 Postgres error 원인과 별개로, 현재 앱이 기대하는 컬럼/데이터 상태를 빠르게 확인한다.

-- 1) 앱이 기대하는 주요 컬럼이 실제로 있는지 확인
select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'sessions',
    'messages',
    'memories',
    'relationship_milestones',
    'relationship_commitments',
    'character_daily_states',
    'push_subscriptions',
    'feedback_bonus_requests'
  )
order by table_name, ordinal_position;

-- 2) 테이블별 대략적인 데이터 규모
select 'sessions' as table_name, count(*) as row_count from sessions
union all
select 'messages', count(*) from messages
union all
select 'memories', count(*) from memories
union all
select 'relationship_milestones', count(*) from relationship_milestones
union all
select 'relationship_commitments', count(*) from relationship_commitments
union all
select 'character_daily_states', count(*) from character_daily_states
union all
select 'push_subscriptions', count(*) from push_subscriptions
union all
select 'feedback_bonus_requests', count(*) from feedback_bonus_requests;

-- 3) 메시지 없는 세션 / 이름 없는 세션 / 연인 상태 세션 확인
select
  count(*) filter (
    where not exists (select 1 from messages m where m.session_id = s.id)
  ) as empty_sessions,
  count(*) filter (where s.user_name is null) as unnamed_sessions,
  count(*) filter (where s.relationship_stage = '연인') as confessed_sessions
from sessions s;

-- 4) 이벤트 타입 분포. time_skip이나 오탐 이벤트가 얼마나 남아있는지 확인할 때 사용
select
  coalesce(event_type, '(none)') as event_type,
  count(*) as row_count
from messages
group by event_type
order by row_count desc;

-- 5) 아직 이어지는 약속/계획 샘플
select
  session_id,
  title,
  detail,
  owner,
  due_label,
  status,
  source_message,
  created_at
from relationship_commitments
where status = 'pending'
order by created_at desc
limit 50;

-- 6) 오늘 피드백 보너스 요청 샘플
select
  session_id,
  date_key,
  bonus_count,
  daily_message_count,
  relationship_stage,
  character_name,
  persona_type,
  left(content, 120) as feedback_preview,
  left(last_user_message, 120) as last_user_message_preview,
  left(last_assistant_message, 120) as last_assistant_message_preview,
  created_at
from feedback_bonus_requests
order by created_at desc
limit 50;

-- 7) 고백 엔딩 메시지와 confessed_at이 어긋난 세션 후보
select
  s.id,
  s.relationship_stage,
  s.relationship_score,
  s.confessed_at,
  count(m.id) filter (where m.event_type = 'confession_ending') as confession_messages
from sessions s
left join messages m on m.session_id = s.id
where s.relationship_stage = '연인'
   or s.confessed_at is not null
   or m.event_type = 'confession_ending'
group by s.id
order by s.confessed_at desc nulls last
limit 100;
