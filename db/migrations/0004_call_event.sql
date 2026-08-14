-- "전화하자" 이벤트 추가: call_request(캐릭터가 전화하자고 제안) / call_ended(통화 종료 구분선).
alter table messages drop constraint if exists messages_event_type_check;
alter table messages add constraint messages_event_type_check
  check (event_type in ('deleted_message','time_skip','reconnect_first_message','call_request','call_ended'));
