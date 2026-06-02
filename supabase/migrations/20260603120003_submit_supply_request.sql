-- M2 P-E #23 — submit_supply_request: anon 소모품 제출(서버가 모든 값 검증·강제).
-- 등록고객 전용(미등록=거부). 동의·체크섬·신청자 필수. items는 보유장비 매칭 active 소모품만(list RPC 단일소스, C2),
-- qty 1..9999 정수, 중복 차단. status='received'·assignee·name/unit 스냅샷 모두 서버 강제(클라 위조 무시).
create or replace function public.submit_supply_request(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_biz text := regexp_replace(coalesce(payload->>'biz_no', ''), '\D', '', 'g');
  v_consent_type text := jsonb_typeof(payload->'privacy_consent');
  v_consent_ver text := nullif(btrim(payload->>'privacy_consent_version'), '');
  v_requester_name text := nullif(btrim(payload->>'requester_name'), '');
  v_requester_phone text := nullif(btrim(payload->>'requester_phone'), '');
  v_note text := nullif(btrim(payload->>'note'), '');
  v_items jsonb := payload->'items';
  v_company_id uuid;
  v_assignee uuid;
  v_assignee_name text;
  v_allowed_ids uuid[];
  v_weights int[] := array[1,3,7,1,3,7,1,3,5];
  v_sum int := 0;
  v_i int;
  v_seq text;
  v_req_id uuid;
  v_elem jsonb;
  v_cid uuid;
  v_qty numeric;
  v_seen uuid[] := '{}';
  v_uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_name text;
  v_unit text;
begin
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

  -- 신청자(개인) 필수 — 콜백 검증(신원모델 A).
  if v_requester_name is null then
    raise exception '신청자명은 필수입니다';
  end if;
  if v_requester_phone is null then
    raise exception '신청자 연락처는 필수입니다';
  end if;
  if char_length(v_requester_name) > 100 or char_length(v_requester_phone) > 50 then
    raise exception '신청자 정보가 허용 길이를 초과했습니다';
  end if;
  if v_note is not null and char_length(v_note) > 2000 then
    raise exception '요청 메모가 허용 길이를 초과했습니다';
  end if;

  -- biz_no 필수 + 체크섬.
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

  -- 회사 조회 — 등록고객 전용(미등록은 담당자 안내, 신청 차단).
  select id, assignee_id into v_company_id, v_assignee from public.companies where biz_no = v_biz;
  if v_company_id is null then
    raise exception '등록된 고객만 소모품을 신청할 수 있습니다. 담당자에게 문의해 주세요';
  end if;

  -- items 타입가드(null/객체/문자열/빈배열 거부) + 라인 수 상한.
  if jsonb_typeof(v_items) is distinct from 'array' or jsonb_array_length(v_items) < 1 then
    raise exception '소모품을 1개 이상 선택해 주세요';
  end if;
  if jsonb_array_length(v_items) > 200 then
    raise exception '한 번에 신청할 수 있는 품목 수를 초과했습니다';
  end if;

  -- 허용 소모품 = 보유장비 매칭 active set (list_consumables_for_company 단일소스, C2 — 매칭규칙 인라인 복제 금지).
  select coalesce(array_agg((e->>'id')::uuid), '{}') into v_allowed_ids
  from jsonb_array_elements(public.list_consumables_for_company(v_biz) -> 'consumables') e;

  insert into public.supply_requests
    (company_id, requester_name, requester_phone, note, privacy_consent, privacy_consent_at, privacy_consent_version, status)
  values (v_company_id, v_requester_name, v_requester_phone, v_note, true, now(), v_consent_ver, 'received')
  returning id, seq_no into v_req_id, v_seq;

  for v_elem in select * from jsonb_array_elements(v_items) loop
    -- consumable_id uuid 형식.
    if coalesce(v_elem->>'consumable_id', '') !~* v_uuid_re then
      raise exception '유효하지 않은 소모품입니다';
    end if;
    v_cid := (v_elem->>'consumable_id')::uuid;
    -- 보유장비 매칭 active set 포함(미매칭·inactive·존재안함 차단).
    if not (v_cid = any(v_allowed_ids)) then
      raise exception '보유 장비에 해당하지 않는 소모품입니다';
    end if;
    -- 중복 차단.
    if v_cid = any(v_seen) then
      raise exception '중복된 소모품이 있습니다';
    end if;
    v_seen := v_seen || v_cid;
    -- qty: number 타입 + 정수 + 1..9999.
    if jsonb_typeof(v_elem->'qty') is distinct from 'number' then
      raise exception '수량이 올바르지 않습니다';
    end if;
    v_qty := (v_elem->>'qty')::numeric;
    if v_qty <> floor(v_qty) or v_qty < 1 or v_qty > 9999 then
      raise exception '수량은 1~9999 사이의 정수여야 합니다';
    end if;
    -- name/unit 스냅샷은 서버가 카탈로그에서 채움(클라 위조 무시).
    select name, unit into v_name, v_unit from public.consumables where id = v_cid;
    insert into public.supply_request_items
      (request_id, consumable_id, consumable_name_snapshot, consumable_unit_snapshot, qty)
    values (v_req_id, v_cid, v_name, v_unit, v_qty::int);
  end loop;

  -- 완료화면 SLA: 담당영업 이름(등록+배정 시). 트리거가 assignee_id를 company.assignee_id로 채웠다.
  if v_assignee is not null then
    select name into v_assignee_name from public.profiles where id = v_assignee;
  end if;

  return jsonb_build_object('seq_no', v_seq, 'assignee_name', v_assignee_name);
end;
$$;
revoke all on function public.submit_supply_request(jsonb) from public;
grant execute on function public.submit_supply_request(jsonb) to anon, authenticated;
