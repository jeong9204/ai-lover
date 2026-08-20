-- 고백 엔딩: 관계가 충분히 무르익은 뒤 유저(또는 캐릭터)가 사귀자고 확실히 말하면
-- 그 순간을 기록해서, 이후로는 항상 "연인" 단계로 고정한다.
alter table sessions add column if not exists confessed_at timestamptz;

alter table messages drop constraint if exists messages_event_type_check;
alter table messages add constraint messages_event_type_check
  check (event_type in ('deleted_message','time_skip','reconnect_first_message','call_request','call_ended','confession_ending'));
