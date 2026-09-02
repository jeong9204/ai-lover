-- 만남 이벤트: 카톡에서 약속을 잡은 뒤, 실제 만남 장면은 짧은 이벤트 카드로 넘긴다.
alter table messages drop constraint if exists messages_event_type_check;
alter table messages add constraint messages_event_type_check
  check (event_type in (
    'deleted_message',
    'time_skip',
    'reconnect_first_message',
    'call_request',
    'call_ended',
    'confession_ending',
    'photo_shared',
    'meetup_request',
    'meetup_completed'
  ));
