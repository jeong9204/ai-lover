-- 최근 대화 소재를 세션 단위로 보관한다. 별도 테이블 없이 작은 JSONB 상태만 유지한다.
alter table sessions
  add column if not exists topic_state jsonb not null default
  '{"recentTopics":[],"exhaustedTopics":[],"unresolvedTopics":[]}'::jsonb;
