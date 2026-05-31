-- E3 P2 #4 — 공개 견적요청 RPC.
-- anon은 applications INSERT는 되지만 SELECT 정책이 없어 INSERT...RETURNING seq_no가 막힌다.
-- SECURITY DEFINER(소유자=테이블 소유자 권한, RLS 우회)로 RETURNING을 가능케 해
-- 접수번호(REQ-...)를 고객에게 돌려준다. 이것이 RPC를 두는 유일한 이유다.
-- status='new'·assignee_id=null은 함수가 하드코딩 강제(payload 값 무시) → anon 위조 차단.
-- seq_no·created_at은 기존 applications_server_fields BEFORE INSERT 트리거가 재차 강제(이중 안전).
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
