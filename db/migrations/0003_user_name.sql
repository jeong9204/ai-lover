-- 유저가 처음 시작할 때 입력한 이름/애칭. 없으면(NULL) 캐릭터는 이름을 지어내지 않고
-- "너"로만 부르도록 system prompt에서 안전장치를 둔다 (lib/persona.ts 참고).

alter table sessions add column if not exists user_name text;
