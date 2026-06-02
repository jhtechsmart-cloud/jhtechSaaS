-- rollback: submit_application v2 → v1 복원
-- v2(동의·equipment_id·photos)를 제거하고 E3 원본 v1 함수(20260531120000_submit_application.sql) 본문을 그대로 재적용한다.
-- create or replace 이므로 이 파일을 실행하면 v1으로 원복된다.
create or replace function public.submit_application(payload jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company text := nullif(btrim(payload->>'company'), '');
  v_fields jsonb := coalesce(payload->'fields', '{}'::jsonb);
  v_seq text;
begin
  if v_company is null then
    raise exception '회사명은 필수입니다';
  end if;
  -- 길이 캡(anon 남용·저장소 폭주 방지). 코어 ≤200, 주소 ≤500, 요청사항 ≤2000, fields ≤8KB.
  if length(v_company) > 200
     or coalesce(length(payload->>'ceo'), 0) > 200
     or coalesce(length(payload->>'biz_no'), 0) > 200
     or coalesce(length(payload->>'phone'), 0) > 200
     or coalesce(length(payload->>'email'), 0) > 200
     or coalesce(length(payload->>'address'), 0) > 500
     or coalesce(length(v_fields->>'requirements'), 0) > 2000
     or octet_length(v_fields::text) > 8192 then
    raise exception '입력값이 허용 길이를 초과했습니다';
  end if;

  insert into public.applications
    (company, ceo, biz_no, phone, email, address, fields, status, assignee_id, submitted_at)
  values (
    v_company,
    nullif(btrim(payload->>'ceo'), ''),
    nullif(btrim(payload->>'biz_no'), ''),
    nullif(btrim(payload->>'phone'), ''),
    nullif(btrim(payload->>'email'), ''),
    nullif(btrim(payload->>'address'), ''),
    v_fields,
    'new',     -- 하드코딩 강제
    null,      -- 하드코딩 강제(미배정)
    now()
  )
  returning seq_no into v_seq;

  return v_seq;
end;
$$;

-- public 전체에서 회수 후 anon·authenticated에만 EXECUTE 부여.
revoke all on function public.submit_application(jsonb) from public;
grant execute on function public.submit_application(jsonb) to anon, authenticated;
