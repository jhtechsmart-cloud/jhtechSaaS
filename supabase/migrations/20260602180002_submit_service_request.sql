-- M2 P-D #22 — submit_service_request: anon A/S 제출(서버가 모든 값 검증·강제).
-- submit_application 패턴 + (1)biz_no 필수·체크섬, (2)company_equipment 소유검증(company_id 바인딩),
-- (3)미등록(회사 없음)도 company_id NULL로 접수, (4)완료화면 SLA용 assignee_name 반환.
create or replace function public.submit_service_request(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact text := nullif(btrim(payload->>'contact_company'), '');
  v_fields jsonb := coalesce(payload->'fields', '{}'::jsonb);
  v_biz text := regexp_replace(coalesce(payload->>'biz_no',''), '\D', '', 'g');
  v_consent_type text := jsonb_typeof(payload->'privacy_consent');
  v_consent_ver text := nullif(btrim(payload->>'privacy_consent_version'), '');
  v_symptom text := nullif(btrim(v_fields->>'symptom'), '');
  v_pref text := nullif(btrim(v_fields->>'preferred_date'), '');
  v_clean_fields jsonb;
  v_uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_ce_raw text;
  v_ce_id uuid;
  v_company_id uuid;
  v_assignee uuid;
  v_assignee_name text;
  v_photos jsonb := coalesce(v_fields->'photos', '{}'::jsonb);
  v_slot text;
  v_path text;
  v_weights int[] := array[1,3,7,1,3,7,1,3,5];
  v_sum int := 0;
  v_i int;
  v_seq text;
begin
  if v_contact is null then
    raise exception '회사명은 필수입니다';
  end if;

  -- 개인정보 동의 — JSON boolean true만 인정(문자열/숫자 거부). 버전은 실재 정책이어야 함.
  if v_consent_type is distinct from 'boolean' or (payload->'privacy_consent')::boolean is not true then
    raise exception '개인정보 수집·이용 동의가 필요합니다';
  end if;
  if v_consent_ver is null then
    raise exception '동의 버전이 누락되었습니다';
  end if;
  if not exists (select 1 from public.privacy_policies where version = v_consent_ver) then
    raise exception '유효하지 않은 동의 버전입니다';
  end if;

  -- biz_no 필수(미등록도 사업자번호는 받음) + 체크섬 항상 검증.
  if v_biz = '' then
    raise exception '사업자등록번호는 필수입니다';
  end if;
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

  -- 증상 필수 + 길이 캡(anon 폭주 방지)
  if v_symptom is null then
    raise exception '증상 내용은 필수입니다';
  end if;
  -- 희망일(선택): YYYY-MM-DD 형식만. 임의 텍스트/스크립트 주입 차단.
  if v_pref is not null and v_pref !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception '희망일 형식이 올바르지 않습니다';
  end if;
  if length(v_symptom) > 2000
     or coalesce(length(v_contact), 0) > 200
     or coalesce(length(payload->>'contact_phone'), 0) > 200
     or coalesce(length(payload->>'contact_email'), 0) > 200
     or coalesce(length(payload->>'contact_address'), 0) > 500
     or octet_length(v_fields::text) > 8192 then
    raise exception '입력값이 허용 길이를 초과했습니다';
  end if;

  -- 회사 조회(미등록이면 NULL — 차단하지 않고 접수, 담당자 콜백 검증).
  select id, assignee_id into v_company_id, v_assignee from public.companies where biz_no = v_biz;

  -- 보유장비(선택): 반드시 그 회사 소유여야 함(타사 장비 id 위조 차단). 미등록(company 없음)이면 장비 불가.
  v_ce_raw := nullif(payload->>'company_equipment_id', '');
  if v_ce_raw is not null then
    if v_ce_raw !~* v_uuid_re then
      raise exception '유효하지 않은 장비입니다';
    end if;
    v_ce_id := v_ce_raw::uuid;
    if v_company_id is null
       or not exists (select 1 from public.company_equipment where id = v_ce_id and company_id = v_company_id) then
      raise exception '유효하지 않은 장비입니다';
    end if;
  end if;

  -- photos 슬롯 화이트리스트(as_photo_1..3) + 버킷-상대 경로 정규식(개수는 슬롯 3종으로 자동 ≤3).
  for v_slot in select jsonb_object_keys(v_photos) loop
    if v_slot not in ('as_photo_1', 'as_photo_2', 'as_photo_3') then
      raise exception '허용되지 않은 사진 슬롯입니다';
    end if;
    v_path := v_photos->>v_slot;
    if v_path is not null and v_path !~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' || v_slot || '\.(jpg|png|webp)$') then
      raise exception '사진 경로 형식이 올바르지 않습니다';
    end if;
  end loop;

  -- fields 화이트리스트 재구성 — anon이 임의 키(equipment_text 등) 주입 못 하게 서버가 통제.
  v_clean_fields := jsonb_build_object('symptom', v_symptom, 'photos', v_photos);
  if v_pref is not null then
    v_clean_fields := v_clean_fields || jsonb_build_object('preferred_date', v_pref);
  end if;

  insert into public.service_requests
    (biz_no, company_id, company_equipment_id, contact_company, contact_ceo, contact_phone, contact_email, contact_address,
     privacy_consent, privacy_consent_at, privacy_consent_version, fields, status)
  values (
    v_biz, v_company_id, v_ce_id, v_contact,
    nullif(btrim(payload->>'contact_ceo'), ''),
    nullif(btrim(payload->>'contact_phone'), ''),
    nullif(btrim(payload->>'contact_email'), ''),
    nullif(btrim(payload->>'contact_address'), ''),
    true, now(), v_consent_ver, v_clean_fields, 'received'
  )
  returning seq_no into v_seq;

  -- 완료화면 SLA: 담당영업 이름(등록+배정 시). 트리거가 assignee_id를 company.assignee_id로 채웠다.
  if v_assignee is not null then
    select name into v_assignee_name from public.profiles where id = v_assignee;
  end if;

  return jsonb_build_object('seq_no', v_seq, 'assignee_name', v_assignee_name);
end;
$$;
revoke all on function public.submit_service_request(jsonb) from public;
grant execute on function public.submit_service_request(jsonb) to anon, authenticated;
