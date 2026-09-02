-- 새 세션마다 캐릭터 이름을 하나 배정한다. 기존 세션은 앱 fallback으로 "이준"을 사용한다.
alter table sessions add column if not exists character_name text;
