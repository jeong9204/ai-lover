-- 캐릭터 말투 타입: 기본 10년지기 / 북부대공 / 능글
alter table sessions add column if not exists persona_type text;

alter table sessions drop constraint if exists sessions_persona_type_check;
alter table sessions add constraint sessions_persona_type_check
  check (persona_type is null or persona_type in ('default', 'northern_duke', 'flirty'));
