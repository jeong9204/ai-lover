-- "5분 뒤 전화할게"처럼 캐릭터가 조금 뒤 먼저 전화하기로 한 흐름을 저장한다.

alter table character_activities drop constraint if exists character_activities_type_check;
alter table character_activities add constraint character_activities_type_check
  check (type in ('busy_work', 'scheduled_call'));
