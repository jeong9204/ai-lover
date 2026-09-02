-- 사진 메시지: 이준이 보낸 이미지 URL/출처 정보를 메시지 metadata에 저장한다.
-- time_skip은 과거 데이터 호환을 위해 constraint에 남겨두되, 앱에서는 계속 숨긴다.
alter table messages add column if not exists metadata jsonb;

alter table messages drop constraint if exists messages_event_type_check;
alter table messages add constraint messages_event_type_check
  check (event_type in (
    'deleted_message',
    'time_skip',
    'reconnect_first_message',
    'call_request',
    'call_ended',
    'confession_ending',
    'photo_shared'
  ));
