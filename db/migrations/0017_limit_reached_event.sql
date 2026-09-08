-- 한도 초과 상태에서 통화가 끝났을 때 안내 메시지를 system_event로 저장한다.

alter table messages drop constraint if exists messages_event_type_check;
alter table messages add constraint messages_event_type_check
  check (
    event_type in (
      'deleted_message',
      'time_skip',
      'reconnect_first_message',
      'call_request',
      'call_ended',
      'confession_ending',
      'photo_shared',
      'meetup_request',
      'meetup_completed',
      'limit_reached'
    )
  );
