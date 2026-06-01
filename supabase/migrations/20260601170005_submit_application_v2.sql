-- M2 P-A — submit_application v2: 개인정보 동의·equipment_id·현장사진·설치설문 수용.
-- 익명 위조 차단을 위해 status='new'·assignee=null 하드코딩 유지. 동의 미동의 거부.
-- biz_no 체크섬은 서버 재검증(클라 zod와 이중). photos 경로는 정규식 강제(경로조작 차단).
create or replace function public.submit_application(payload jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company text := nullif(btrim(payload->>'company'), '');
  v_fields jsonb := coalesce(payload->'fields', '{}'::jsonb);
  v_biz text := regexp_replace(coalesce(payload->>'biz_no',''), '-', '', 'g');
  v_consent boolean := coalesce((payload->>'privacy_consent')::boolean, false);
  v_consent_ver text := nullif(btrim(payload->>'privacy_consent_version'), '');
  v_equipment_id uuid;
  v_eq_raw text;
  v_photos jsonb := coalesce(v_fields->'photos', '{}'::jsonb);
  v_slot text;
  v_path text;
  v_weights int[] := array[1,3,7,1,3,7,1,3,5];
  v_sum int := 0;
  v_i int;
  v_seq text;
begin
  if v_company is null then
    raise exception '회사명은 필수입니다';
  end if;

  -- 개인정보 동의 필수
  if v_consent is not true then
    raise exception '개인정보 수집·이용 동의가 필요합니다';
  end if;
  if v_consent_ver is null then
    raise exception '동의 버전이 누락되었습니다';
  end if;

  -- 길이 캡(anon 남용·저장소 폭주 방지)
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

  -- biz_no 체크섬(국세청 가중치). 값이 있을 때만 검증.
  if v_biz <> '' then
    if v_biz !~ '^\d{10}$' then
      raise exception '사업자등록번호 형식이 올바르지 않습니다';
    end if;
    for v_i in 1..9 loop
      v_sum := v_sum + (substr(v_biz, v_i, 1)::int) * v_weights[v_i];
    end loop;
    v_sum := v_sum + floor((substr(v_biz, 9, 1)::int) * 5 / 10);
    if ((10 - (v_sum % 10)) % 10) <> substr(v_biz, 10, 1)::int then
      raise exception '사업자등록번호 체크섬이 일치하지 않습니다';
    end if;
  end if;

  -- equipment_id(선택): payload 최상위 우선, 없으면 fields. 형식 + active 검증.
  v_eq_raw := coalesce(nullif(payload->>'equipment_id', ''), nullif(v_fields->>'equipment_id', ''));
  if v_eq_raw is not null then
    v_equipment_id := v_eq_raw::uuid;
    if not exists (select 1 from public.equipment where id = v_equipment_id and status = 'active') then
      raise exception '유효하지 않은 장비입니다';
    end if;
  end if;

  -- photos 경로 정규식 강제(경로조작·타버킷 차단)
  for v_slot in select jsonb_object_keys(v_photos) loop
    if v_slot not in ('ext_entrance','ext_building','int_entrance','int_location') then
      raise exception '허용되지 않은 사진 슬롯입니다';
    end if;
    v_path := v_photos->>v_slot;
    if v_path is not null and v_path !~ ('^customer-uploads/[0-9a-f-]{36}/' || v_slot || '\.(jpg|png|webp)$') then
      raise exception '사진 경로 형식이 올바르지 않습니다';
    end if;
  end loop;

  insert into public.applications
    (company, ceo, biz_no, phone, email, address, equipment_id,
     privacy_consent, privacy_consent_at, privacy_consent_version,
     fields, status, assignee_id, submitted_at)
  values (
    v_company,
    nullif(btrim(payload->>'ceo'), ''),
    nullif(v_biz, ''),
    nullif(btrim(payload->>'phone'), ''),
    nullif(btrim(payload->>'email'), ''),
    nullif(btrim(payload->>'address'), ''),
    v_equipment_id,
    true,            -- 동의 강제 기록
    now(),
    v_consent_ver,
    v_fields,
    'new',           -- 하드코딩 강제
    null,            -- 하드코딩 강제(미배정)
    now()
  )
  returning seq_no into v_seq;

  return v_seq;
end;
$$;

revoke all on function public.submit_application(jsonb) from public;
grant execute on function public.submit_application(jsonb) to anon, authenticated;
