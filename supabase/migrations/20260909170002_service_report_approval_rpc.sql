-- #285 ③ RPC. 재정의 원본(최신판 기준 복사 + 계획된 diff만 적용 — 구판 기준 재정의 회귀 금지):
--   upsert/issue = 20260720170000 · pdf_status = 20260720190000 · retry = 20260716200000 · void/resolve = 20260716170100.
-- 신규: approve_service_report / complete_service_report / enqueue_service_report_email / service_report_kpis /
--       get_service_report_approval_notice.
-- 생성 스크립트: 세션 scratchpad gen_rpc_migration.py(반복 실행 시 동일 결과).

-- ── A. upsert_service_report — 기사 서명 경로·후속 부모 저장 ──────────────────────────────
create or replace function public.upsert_service_report(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_reports;
  v_company public.companies;
  v_equip_company uuid;
  v_equip_name text;
  v_equip_serial text;
  v_equip_purchased date;
  v_equip_catalog uuid;   -- [1a] 선택한 보유장비가 가리키는 카탈로그 장비
  v_catalog_id uuid;      -- [1a] 리포트에 저장할 카탈로그 링크
  v_req public.service_requests;
  v_email_re text := '^[^@[:space:],]+@[^@[:space:],]+\.[^@[:space:],]+$';
  v_faults text[];
  v_parts jsonb := coalesce(p -> 'parts', '[]'::jsonb);
  v_part jsonb;
  v_photos_before text[];
  v_photos_after text[];
  v_signature text;
  v_engineer_sig text;    -- #285 기사 서명(결재 담당 칸)
  v_parent uuid := nullif(p ->> 'parent_report_id', '')::uuid;   -- #285 후속 리포트 부모(1단)
  v_charge text := coalesce(p ->> 'charge_type', 'paid');
  v_free_reason text := nullif(btrim(coalesce(p ->> 'free_reason', '')), '');
  v_visit int; v_ot int; v_parts_total bigint := 0; v_supply int; v_vat int;
  v_company_id uuid := nullif(p ->> 'company_id', '')::uuid;
  v_equipment_id uuid := nullif(p ->> 'company_equipment_id', '')::uuid;
  v_request_id uuid := nullif(p ->> 'service_request_id', '')::uuid;
  v_recipient text := nullif(btrim(coalesce(p ->> 'recipient_email', '')), '');
  v_prefix text;
  v_path text;
  v_cust_name text; v_cust_biz text; v_cust_tel text; v_cust_addr text; v_recip_final text;
  v_dev_name text; v_dev_serial text; v_dev_purch date; v_total int;
begin
  if not public.has_permission(v_uid, 'service_reports.write') then
    raise exception '서비스 리포트 작성 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(coalesce(p, 'null'::jsonb)) is distinct from 'object' then
    raise exception '잘못된 요청 본문입니다';
  end if;

  -- 기존 draft 수정이면 소유·상태 검사(발행본은 동결 트리거가 최종 차단하지만 친절 메시지 선차단)
  if p_id is not null then
    select * into v_row from public.service_reports where id = p_id;
    if not found then raise exception '존재하지 않는 리포트입니다: %', p_id; end if;
    if v_row.created_by <> v_uid then
      raise exception '본인이 작성한 리포트만 수정할 수 있습니다' using errcode = 'insufficient_privilege';
    end if;
    if v_row.status <> 'draft' then
      raise exception '발행/무효화된 리포트는 수정할 수 없습니다';
    end if;
  end if;

  -- 고장분류: 배열·항목 길이 캡
  select coalesce(array_agg(btrim(x)), '{}')
    into v_faults
    from jsonb_array_elements_text(coalesce(p -> 'faults', '[]'::jsonb)) as t(x)
    where btrim(x) <> '';
  if cardinality(v_faults) > 20 then raise exception '고장 분류는 최대 20개입니다'; end if;
  if exists (select 1 from unnest(v_faults) f where char_length(f) > 60) then
    raise exception '고장 분류 항목이 너무 깁니다(최대 60자)';
  end if;

  -- 부품: 형태·개수·범위 검증 + 합계 서버 계산
  if jsonb_typeof(v_parts) is distinct from 'array' then
    raise exception 'parts는 배열이어야 합니다';
  end if;
  if jsonb_array_length(v_parts) > 30 then raise exception '부품은 최대 30행입니다'; end if;
  for v_part in select * from jsonb_array_elements(v_parts) loop
    if jsonb_typeof(v_part) is distinct from 'object'
       or char_length(btrim(coalesce(v_part ->> 'name', ''))) not between 1 and 100
       or coalesce((v_part ->> 'qty')::numeric % 1, 1) <> 0
       or (v_part ->> 'qty')::int not between 1 and 999
       or coalesce((v_part ->> 'price')::numeric % 1, 1) <> 0
       or (v_part ->> 'price')::int not between 0 and 100000000 then
      raise exception '부품 행이 올바르지 않습니다(name 1~100자, qty 1~999, price 0~1억)';
    end if;
    v_parts_total := v_parts_total + (v_part ->> 'qty')::bigint * (v_part ->> 'price')::bigint;
  end loop;
  if v_parts_total > 100000000 then
    raise exception '부품 합계가 너무 큽니다(최대 1억)';
  end if;
  -- 정규화: name/qty/price만 보존(임의 키 제거)
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', btrim(x ->> 'name'), 'qty', (x ->> 'qty')::int, 'price', (x ->> 'price')::int)), '[]'::jsonb)
    into v_parts from jsonb_array_elements(v_parts) as t(x);

  -- 청구: 서버 재계산(무상=전액 0)
  if v_charge not in ('paid', 'free') then raise exception 'charge_type이 올바르지 않습니다'; end if;
  v_visit := coalesce(nullif(p ->> 'visit_fee', '')::int, 0);
  v_ot := coalesce(nullif(p ->> 'overtime_fee', '')::int, 0);
  if v_visit not between 0 and 100000000 or v_ot not between 0 and 100000000 then
    raise exception '출장비 범위가 올바르지 않습니다(0~1억)';
  end if;
  if v_charge = 'free' then
    v_visit := 0; v_ot := 0; v_parts_total := 0; v_supply := 0; v_vat := 0;
  else
    v_free_reason := null;
    v_supply := v_visit + v_ot + v_parts_total;
    v_vat := round(v_supply * 0.1);
  end if;
  -- 수신 이메일 형식(있을 때만 — 없으면 발송 생략)
  if v_recipient is not null and v_recipient !~ v_email_re then
    raise exception '수신 이메일 형식이 올바르지 않습니다';
  end if;

  -- 연결 무결성: 신청·장비는 같은 고객 소속이어야 함(교차 링크 위조 차단)
  if v_company_id is not null then
    select * into v_company from public.companies where id = v_company_id;
    if not found then raise exception '존재하지 않는 고객입니다'; end if;
  end if;
  if v_request_id is not null then
    select * into v_req from public.service_requests where id = v_request_id;
    if not found then raise exception '존재하지 않는 A/S 신청입니다'; end if;
    if v_company_id is not null and v_req.company_id is distinct from v_company_id then
      raise exception 'A/S 신청이 선택한 고객의 것이 아닙니다';
    end if;
  end if;
  if v_equipment_id is not null then
    select ce.company_id, coalesce(e.name, ce.label), ce.serial_no, ce.purchased_at, ce.equipment_id
      into v_equip_company, v_equip_name, v_equip_serial, v_equip_purchased, v_equip_catalog
      from public.company_equipment ce
      left join public.equipment e on e.id = ce.equipment_id
      where ce.id = v_equipment_id;
    if not found then raise exception '존재하지 않는 보유장비입니다'; end if;
    if v_company_id is not null and v_equip_company is distinct from v_company_id then
      raise exception '보유장비가 선택한 고객의 것이 아닙니다';
    end if;
  end if;

  -- [1a] 카탈로그 링크 결정. 보유장비를 골랐으면 그 행에서 서버가 파생(클라 값 무시 — 두 필드가
  -- 서로 다른 장비를 가리킨 채 저장되는 모순 차단). 직접입력이면 피커가 보낸 id를 검증 후 채택.
  if v_equipment_id is not null then
    v_catalog_id := v_equip_catalog;
  else
    v_catalog_id := nullif(btrim(coalesce(p ->> 'catalog_equipment_id', '')), '')::uuid;
    if v_catalog_id is not null
       and not exists (select 1 from public.equipment e where e.id = v_catalog_id) then
      raise exception '존재하지 않는 카탈로그 장비입니다';
    end if;
  end if;

  -- 사진·서명 경로: 이 리포트 폴더 소속만(첫 저장 전엔 첨부 불가)
  v_photos_before := coalesce(
    (select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'photos_before', '[]'::jsonb)) t(x)), '{}');
  v_photos_after := coalesce(
    (select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'photos_after', '[]'::jsonb)) t(x)), '{}');
  v_signature := nullif(btrim(coalesce(p ->> 'signature_path', '')), '');
  if p_id is null then
    if cardinality(v_photos_before) > 0 or cardinality(v_photos_after) > 0 or v_signature is not null then
      raise exception '사진·서명은 첫 임시저장 후 첨부할 수 있습니다';
    end if;
  else
    v_prefix := p_id::text || '/';
    foreach v_path in array (v_photos_before || v_photos_after) loop
      if v_path !~ ('^' || v_prefix || '(before|after)-[1-6]\.(jpg|jpeg|png|webp)$') then
        raise exception '사진 경로가 올바르지 않습니다: %', v_path;
      end if;
    end loop;
    if v_signature is not null and v_signature <> v_prefix || 'signature.png' then
      raise exception '서명 경로가 올바르지 않습니다';
    end if;
  end if;
  -- #285 기사 서명: 이 리포트 폴더의 engineer-signature.png만(첫 저장 전엔 불가). 빈 값 → null(무효화).
  v_engineer_sig := nullif(btrim(coalesce(p ->> 'engineer_signature_path', '')), '');
  if v_engineer_sig is not null then
    if p_id is null then raise exception '사진·서명은 첫 임시저장 후 첨부할 수 있습니다'; end if;
    if v_engineer_sig <> v_prefix || 'engineer-signature.png' then
      raise exception '기사 서명 경로가 올바르지 않습니다';
    end if;
  end if;
  -- #285 후속 리포트 부모: 존재만 검사(불변식은 확정 시 issue RPC가 강제)
  if v_parent is not null and not exists (select 1 from public.service_reports pr where pr.id = v_parent) then
    raise exception '존재하지 않는 부모 리포트입니다';
  end if;

  -- 스냅샷 값 1회 계산(INSERT/UPDATE 공용 — 분기 간 조용한 발산 방지)
  if v_company.id is not null then
    v_cust_name := v_company.name;
    v_cust_biz := v_company.biz_no;
    v_cust_tel := coalesce(v_company.phone, left(coalesce(p ->> 'customer_tel', ''), 30));
    v_cust_addr := coalesce(v_company.address, left(coalesce(p ->> 'customer_addr', ''), 500));
    v_recip_final := coalesce(v_recipient, v_company.email);
  else
    v_cust_name := left(btrim(coalesce(p ->> 'customer_name', '')), 200);
    v_cust_biz := nullif(regexp_replace(coalesce(p ->> 'customer_biz_no', ''), '\D', '', 'g'), '');
    v_cust_tel := left(coalesce(p ->> 'customer_tel', ''), 30);
    v_cust_addr := left(coalesce(p ->> 'customer_addr', ''), 500);
    v_recip_final := v_recipient;
  end if;
  if v_equipment_id is not null then
    v_dev_name := coalesce(v_equip_name, '');
    v_dev_serial := v_equip_serial;
    v_dev_purch := v_equip_purchased;
  else
    v_dev_name := left(btrim(coalesce(p ->> 'device_name', '')), 200);
    v_dev_serial := left(coalesce(p ->> 'device_serial', ''), 100);
    v_dev_purch := nullif(p ->> 'purchased_at', '')::date;
  end if;
  v_total := case when v_charge = 'free' then 0 else v_visit + v_ot + v_parts_total::int + v_vat end;

  if p_id is null then
    insert into public.service_reports (
      service_request_id, company_id, company_equipment_id, catalog_equipment_id,
      customer_name, customer_biz_no, customer_tel, customer_addr, recipient_email,
      device_name, device_serial, purchased_at,
      faults, diagnosis, action_text,
      follow_needed, follow_memo, follow_date,
      parts, charge_type, free_reason, visit_fee, overtime_fee, parts_total, vat, total,
      parent_report_id,
      created_by
    ) values (
      v_request_id, v_company_id, v_equipment_id, v_catalog_id,
      v_cust_name, v_cust_biz, v_cust_tel, v_cust_addr, v_recip_final,
      v_dev_name, v_dev_serial, v_dev_purch,
      v_faults, left(coalesce(p ->> 'diagnosis', ''), 4000), left(coalesce(p ->> 'action_text', ''), 4000),
      coalesce((p ->> 'follow_needed')::boolean, false),
      left(coalesce(p ->> 'follow_memo', ''), 500), nullif(p ->> 'follow_date', '')::date,
      v_parts, v_charge, v_free_reason, v_visit, v_ot, v_parts_total, v_vat, v_total,
      v_parent,
      v_uid
    ) returning * into v_row;
  else
    update public.service_reports set
      service_request_id = v_request_id,
      company_id = v_company_id,
      company_equipment_id = v_equipment_id,
      catalog_equipment_id = v_catalog_id,
      customer_name = v_cust_name,
      customer_biz_no = v_cust_biz,
      customer_tel = v_cust_tel,
      customer_addr = v_cust_addr,
      recipient_email = v_recip_final,
      device_name = v_dev_name,
      device_serial = v_dev_serial,
      purchased_at = v_dev_purch,
      faults = v_faults,
      diagnosis = left(coalesce(p ->> 'diagnosis', ''), 4000),
      action_text = left(coalesce(p ->> 'action_text', ''), 4000),
      photos_before = v_photos_before,
      photos_after = v_photos_after,
      signature_path = v_signature,
      engineer_signature_path = v_engineer_sig,
      parent_report_id = v_parent,
      follow_needed = coalesce((p ->> 'follow_needed')::boolean, false),
      follow_memo = left(coalesce(p ->> 'follow_memo', ''), 500),
      follow_date = nullif(p ->> 'follow_date', '')::date,
      parts = v_parts,
      charge_type = v_charge,
      free_reason = v_free_reason,
      visit_fee = v_visit,
      overtime_fee = v_ot,
      parts_total = v_parts_total,
      vat = v_vat,
      total = v_total
    where id = p_id
    returning * into v_row;
  end if;

  return to_jsonb(v_row);
end;
$$;
revoke all on function public.upsert_service_report(uuid, jsonb) from public, anon;
grant execute on function public.upsert_service_report(uuid, jsonb) to authenticated;

-- ── B. issue_service_report — 기사 서명 필수·후속 부모 불변식·의뢰 in_progress·부모 follow 처리 ──
create or replace function public.issue_service_report(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_reports;
  v_profile public.profiles;
  v_company_id uuid;
  v_equipment_id uuid;
  v_sig_size int;
  v_eng_sig_size int;             -- #285 기사 서명 실존
  v_parent public.service_reports; -- #285 후속 리포트 부모(FOR UPDATE)
  v_catalog_id uuid;      -- [1a] 해석된 카탈로그 링크(통계 원본)
  v_serial text;          -- [1a] 정규화 시리얼(빈 문자열 → null)
begin
  if not public.has_permission(v_uid, 'service_reports.write') then
    raise exception '서비스 리포트 확정 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;

  -- 행 잠금 — 동시 확정(더블탭)은 여기서 직렬화되고 후발은 status 검사에서 탈락.
  select * into v_row from public.service_reports where id = p_id for update;
  if not found then raise exception '존재하지 않는 리포트입니다: %', p_id; end if;
  if v_row.created_by <> v_uid
     and not public.has_permission(v_uid, 'service_reports.view_all') then
    raise exception '본인이 작성한 리포트만 확정할 수 있습니다' using errcode = 'insufficient_privilege';
  end if;
  if v_row.status <> 'draft' then
    raise exception '이미 확정(또는 무효화)된 리포트입니다';
  end if;

  -- 발행 전제 검증(클라 버튼 disable과 같은 규칙을 서버가 최종 강제)
  if cardinality(v_row.faults) = 0 then raise exception '고장 분류를 1개 이상 선택해야 합니다'; end if;
  if btrim(v_row.diagnosis) = '' then raise exception '점검 내역이 비어 있습니다'; end if;
  if btrim(v_row.action_text) = '' then raise exception '조치 내역이 비어 있습니다'; end if;
  if btrim(coalesce(v_row.customer_name, '')) = '' then raise exception '고객명이 비어 있습니다'; end if;
  if btrim(coalesce(v_row.device_name, '')) = '' then raise exception '장비명이 비어 있습니다'; end if;
  if v_row.charge_type = 'free' and v_row.free_reason is null then
    raise exception '무상 사유를 선택해야 합니다';
  end if;
  if v_row.signature_path is null then
    raise exception '고객 서명이 필요합니다';
  end if;
  -- 서명 객체 실존 + 0바이트 아님(경로만 있고 업로드 실패면 발행 후 영구 복구불능이 되므로 선차단)
  select coalesce((o.metadata ->> 'size')::int, 0) into v_sig_size
    from storage.objects o
    where o.bucket_id = 'service-reports' and o.name = v_row.signature_path;
  if v_sig_size is null or v_sig_size <= 0 then
    raise exception '서명 파일이 업로드되지 않았습니다 — 다시 서명해 주세요';
  end if;
  -- #285 서명 경로 행 바인딩 — RLS UPDATE로 타 리포트 폴더 경로를 넣어도 이 리포트 것만 인정(서명 위조 차단)
  if v_row.signature_path <> p_id::text || '/signature.png' then
    raise exception '서명 경로가 이 리포트의 것이 아닙니다';
  end if;
  -- #285 기사 서명(결재 담당 칸) — 고객 서명과 동일한 실존·크기 검증
  if v_row.engineer_signature_path is null then
    raise exception '기사 서명이 필요합니다(결재 담당 칸)';
  end if;
  if v_row.engineer_signature_path <> p_id::text || '/engineer-signature.png' then
    raise exception '기사 서명 경로가 이 리포트의 것이 아닙니다';
  end if;
  select coalesce((o.metadata ->> 'size')::int, 0) into v_eng_sig_size
    from storage.objects o
    where o.bucket_id = 'service-reports' and o.name = v_row.engineer_signature_path;
  if v_eng_sig_size is null or v_eng_sig_size <= 0 then
    raise exception '기사 서명 파일이 업로드되지 않았습니다 — 다시 서명해 주세요';
  end if;
  -- #285 후속 리포트 부모 불변식(D-C14): 자기 자신 금지·1단·같은 의뢰·같은 고객·확정 이후 상태만.
  -- 부모 FOR UPDATE로 동시 child 확정을 직렬화한다.
  if v_row.parent_report_id is not null then
    if v_row.parent_report_id = v_row.id then raise exception '자기 자신을 부모로 지정할 수 없습니다'; end if;
    select * into v_parent from public.service_reports where id = v_row.parent_report_id for update;
    if not found then raise exception '존재하지 않는 부모 리포트입니다'; end if;
    if v_parent.parent_report_id is not null then raise exception '후속 리포트를 부모로 지정할 수 없습니다(1단만)'; end if;
    if v_parent.status not in ('issued', 'approved', 'completed', 'voided') then
      raise exception '부모 리포트가 확정 전입니다';
    end if;
    if v_parent.service_request_id is distinct from v_row.service_request_id then
      raise exception '같은 의뢰의 리포트만 부모로 지정할 수 있습니다';
    end if;
    -- 고객 비교: 등록 고객이면 id 일치, 직접입력이면 의뢰 연결이 있어야 부모 관계를 인정(둘 다 없으면 타 고객 이력 오염 가능)
    if v_row.company_id is not null then
      if v_parent.company_id is distinct from v_row.company_id then
        raise exception '같은 고객의 리포트만 부모로 지정할 수 있습니다';
      end if;
    elsif v_row.service_request_id is null then
      raise exception '후속 리포트는 등록 고객 또는 연결된 의뢰가 있어야 합니다';
    end if;
  end if;

  -- 신규 고객: 사업자번호 완전일치 → 기존 연결, 아니면 생성(assignee=작성 기사)
  v_company_id := v_row.company_id;
  if v_company_id is null then
    if v_row.customer_biz_no is not null then
      select id into v_company_id from public.companies
        where biz_no = v_row.customer_biz_no limit 1;
    end if;
    if v_company_id is null then
      insert into public.companies (name, biz_no, phone, address, email, assignee_id)
      values (v_row.customer_name, v_row.customer_biz_no, v_row.customer_tel,
              v_row.customer_addr, v_row.recipient_email, v_uid)
      returning id into v_company_id;
    end if;
  end if;

  -- ── [1a] 카탈로그 링크 해석 ─────────────────────────────────────────
  -- 우선순위 고정(downgrade 금지): ①draft에 저장된 피커 선택값(존재만 검증 — draft 이후 카탈로그가
  -- inactive로 바뀌어도 기사의 선택을 지우지 않는다) ②보유장비가 가리키는 카탈로그 ③장비명 매칭.
  v_catalog_id := v_row.catalog_equipment_id;
  if v_catalog_id is not null
     and not exists (select 1 from public.equipment e where e.id = v_catalog_id) then
    v_catalog_id := null;   -- 카탈로그 행이 삭제된 극단 케이스만 폐기
  end if;
  if v_catalog_id is null and v_row.company_equipment_id is not null then
    select ce.equipment_id into v_catalog_id
      from public.company_equipment ce where ce.id = v_row.company_equipment_id;
  end if;
  if v_catalog_id is null then
    v_catalog_id := public.match_catalog_equipment(v_row.device_name);
  end if;

  -- ── [1a] 보유장비 재사용 ────────────────────────────────────────────
  -- 기존: 직접입력이면 무조건 INSERT → 같은 장비를 다시 A/S 할 때마다 행이 늘어 이력이 쪼개졌다.
  -- 고객 단위 어드바이저리 락: FOR UPDATE는 리포트 행만 잠그므로, 두 기사가 같은 고객·같은 장비를
  -- 동시에 확정하면 둘 다 후보 0건을 보고 각자 INSERT 한다. 여기서 직렬화한다.
  v_equipment_id := v_row.company_equipment_id;
  v_serial := nullif(btrim(coalesce(v_row.device_serial, '')), '');
  if v_equipment_id is null and btrim(coalesce(v_row.device_name, '')) <> '' then
    perform pg_advisory_xact_lock(hashtext('svcrep_equip:' || v_company_id::text));

    -- ① 시리얼 완전일치 — 양쪽 모두 비어있지 않을 때만(빈 시리얼끼리 오매칭 차단)
    if v_serial is not null then
      select ce.id into v_equipment_id
        from public.company_equipment ce
       where ce.company_id = v_company_id
         and nullif(btrim(coalesce(ce.serial_no, '')), '') = v_serial
       order by ce.created_at
       limit 1;
    end if;

    -- ② 카탈로그 장비 일치 — 단 시리얼이 서로 모순되지 않을 때만.
    --    같은 모델을 2대 보유(인쇄소 흔한 케이스)하는 경우를 한 행으로 병합하면 안 된다.
    if v_equipment_id is null and v_catalog_id is not null then
      select ce.id into v_equipment_id
        from public.company_equipment ce
       where ce.company_id = v_company_id
         and ce.equipment_id = v_catalog_id
         and ( nullif(btrim(coalesce(ce.serial_no, '')), '') is null
               or v_serial is null
               or nullif(btrim(coalesce(ce.serial_no, '')), '') = v_serial )
       order by ce.created_at
       limit 1;
    end if;

    -- ③ 정규화 장비명 일치(카탈로그 미연결 행) — 동일 시리얼 모순 가드 동일 적용
    if v_equipment_id is null then
      select ce.id into v_equipment_id
        from public.company_equipment ce
       where ce.company_id = v_company_id
         and ce.equipment_id is null
         and regexp_replace(lower(btrim(coalesce(ce.label, ''))), '[^0-9a-z가-힣]', '', 'g')
           = regexp_replace(lower(btrim(v_row.device_name)), '[^0-9a-z가-힣]', '', 'g')
         and regexp_replace(lower(btrim(v_row.device_name)), '[^0-9a-z가-힣]', '', 'g') <> ''
         and ( nullif(btrim(coalesce(ce.serial_no, '')), '') is null
               or v_serial is null
               or nullif(btrim(coalesce(ce.serial_no, '')), '') = v_serial )
       order by ce.created_at
       limit 1;
    end if;

    if v_equipment_id is null then
      -- 재사용 후보 없음 = 진짜 신규 장비. XOR 제약상 equipment_id와 label 중 하나만 채운다.
      if v_catalog_id is not null then
        insert into public.company_equipment (company_id, equipment_id, serial_no, purchased_at, note)
        values (v_company_id, v_catalog_id, v_row.device_serial, v_row.purchased_at,
                nullif(btrim(coalesce(v_row.device_name, '')), ''))
        returning id into v_equipment_id;
      else
        insert into public.company_equipment (company_id, label, serial_no, purchased_at)
        values (v_company_id, v_row.device_name, v_row.device_serial, v_row.purchased_at)
        returning id into v_equipment_id;
      end if;
    else
      -- 재사용: 비어 있던 정보만 보강(사람이 넣은 값을 덮지 않는다)
      update public.company_equipment ce
         set serial_no = coalesce(nullif(btrim(coalesce(ce.serial_no, '')), ''), v_serial),
             purchased_at = coalesce(ce.purchased_at, v_row.purchased_at),
             updated_at = now()
       where ce.id = v_equipment_id;
    end if;
  end if;

  -- #285 UC2: 의뢰는 확정 시 '진행 중'으로, 완료(done)는 관리부 완료(complete_service_report)가 결정한다.
  -- received/on_hold만 전이(in_progress·done·canceled는 no-op — 확정 중단 금지).
  if v_row.service_request_id is not null then
    update public.service_requests
      set status = 'in_progress'
      where id = v_row.service_request_id and status in ('received', 'on_hold');
  end if;

  -- 엔지니어·발신자 스냅샷(발행 후 프로필이 바뀌어도 문서 불변)
  select * into v_profile from public.profiles where id = v_row.created_by;

  -- ⚠️ [1a] catalog_equipment_id는 반드시 이 status 전환 UPDATE에 합쳐 쓴다.
  -- 동결 트리거(20260909170001)는 old.status가 issued/approved/completed일 때 전이별 허용 컬럼만 검사하므로(draft→issued 전환은 v_check=false라
  -- old.status='draft'라 통과) 여기서는 자유롭게 쓰이지만, 확정 후 별도 UPDATE로 쓰면 예외로 실패한다.
  -- 화이트리스트에 이 컬럼을 추가하는 방식으로 우회하지 말 것 — 발행본 통계 원본이 수정 가능해진다.
  perform set_config('app.service_reports_status_change', '1', true);
  update public.service_reports set
    status = 'issued',
    issued_at = now(),
    company_id = v_company_id,
    company_equipment_id = v_equipment_id,
    catalog_equipment_id = v_catalog_id,
    engineer_name = left(coalesce(v_profile.name, ''), 60),
    engineer_title = v_profile.position,
    sender_hiworks_user_id = v_profile.hiworks_user_id
  where id = p_id
  returning * into v_row;

  -- #285 후속 리포트 확정 = 부모의 후속조치 처리 완료(동일 상태 허용 컬럼). voided 부모·수동 처리된 부모는 생략.
  if v_parent.id is not null and v_parent.status <> 'voided'
     and v_parent.follow_needed and v_parent.follow_resolved_at is null then
    update public.service_reports
      set follow_resolved_at = now(), follow_resolved_by = v_uid
      where id = v_parent.id;
  end if;

  return to_jsonb(v_row);
end;
$$;
revoke all on function public.issue_service_report(uuid) from public, anon;
grant execute on function public.issue_service_report(uuid) to authenticated;

-- ── C0. service_request_reevaluate_done — 의뢰 done 조건(D-C13)의 단일 출처. complete·resolve_follow가 호출 ──
--   조건: draft·voided 제외 전 리포트가 completed ∧ 각 후속조치 없음/처리됨. 이미 done/canceled면 no-op.
create or replace function public.service_request_reevaluate_done(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open int;
begin
  if p_request_id is null then return; end if;
  perform 1 from public.service_requests where id = p_request_id for update;
  select count(*) into v_open
    from public.service_reports r
    where r.service_request_id = p_request_id
      and r.status not in ('draft', 'voided')
      and (r.status <> 'completed' or (r.follow_needed and r.follow_resolved_at is null));
  if v_open = 0 then
    update public.service_requests
      set status = 'done'
      where id = p_request_id and status not in ('done', 'canceled');
  end if;
end;
$$;
revoke all on function public.service_request_reevaluate_done(uuid) from public, anon, authenticated;

-- ── C. approve_service_report — 이사 승인(D-A1·D-A3·D-C12) ─────────────────────────────
create or replace function public.approve_service_report(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_reports;
  v_profile public.profiles;
  v_stamp_size int;
begin
  if not public.has_permission(v_uid, 'service_reports.approve') then
    raise exception '서비스 리포트 승인 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  -- 행 잠금 — 두 이사가 동시에 눌러도 후발은 status 검사에서 탈락
  select * into v_row from public.service_reports where id = p_id for update;
  if not found then raise exception '존재하지 않는 리포트입니다: %', p_id; end if;
  if v_row.status <> 'issued' then
    raise exception '승인 대기 상태가 아닙니다(현재: %)', v_row.status;
  end if;
  -- "확인 후 승인": 확정본 PDF가 있어야 승인 가능
  if v_row.pdf_url is null then
    raise exception '확정 PDF가 아직 생성되지 않았습니다 — 잠시 후 승인해 주세요';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.approval_stamp_path is null then
    raise exception '직인이 등록되지 않았습니다 — 관리자에게 등록을 요청하세요';
  end if;
  -- 직인 실존·크기 검증(고객 서명과 동일 패턴) — 없으면 PDF 잡이 반복 실패하므로 선차단
  select coalesce((o.metadata ->> 'size')::int, 0) into v_stamp_size
    from storage.objects o
    where o.bucket_id = 'approval-stamps' and o.name = v_profile.approval_stamp_path;
  if v_stamp_size is null or v_stamp_size <= 0 then
    raise exception '직인 파일을 찾을 수 없습니다 — 관리자에게 재등록을 요청하세요';
  end if;

  -- 승인 시점 스냅샷(이름·직책·직인 경로). 직인은 버전 파일명이라 이후 교체와 무관.
  perform set_config('app.service_reports_status_change', '1', true);
  update public.service_reports set
    status = 'approved',
    approved_at = now(),
    approved_by = v_uid,
    approver_name = left(coalesce(v_profile.name, ''), 60),
    approver_title = v_profile.position,
    approver_stamp_path = v_profile.approval_stamp_path
  where id = p_id
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.approve_service_report(uuid) from public, anon;
grant execute on function public.approve_service_report(uuid) to authenticated;

-- ── D. complete_service_report — 관리부 완료(세금계산서 기록) + 의뢰 done 조건부(D-C13) ────
create or replace function public.complete_service_report(p_id uuid, p_tax_status text, p_tax_date date, p_memo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_reports;
begin
  if not public.has_permission(v_uid, 'service_reports.complete') then
    raise exception '서비스 리포트 완료 처리 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  if p_tax_status is null or p_tax_status not in ('invoiced', 'not_required') then
    raise exception '세금계산서 상태는 invoiced|not_required 중 하나여야 합니다';
  end if;
  if p_tax_status = 'invoiced' and p_tax_date is null then
    raise exception '세금계산서 발행일이 필요합니다';
  end if;
  if length(coalesce(p_memo, '')) > 500 then raise exception '메모는 500자 이내입니다'; end if;

  select * into v_row from public.service_reports where id = p_id for update;
  if not found then raise exception '존재하지 않는 리포트입니다: %', p_id; end if;
  if v_row.status <> 'approved' then
    raise exception '승인된 리포트만 완료 처리할 수 있습니다(현재: %)', v_row.status;
  end if;
  if v_row.pdf_url is null then
    raise exception '승인본 PDF가 아직 생성되지 않았습니다';
  end if;

  perform set_config('app.service_reports_status_change', '1', true);
  update public.service_reports set
    status = 'completed',
    completed_at = now(),
    completed_by = v_uid,
    tax_invoice_status = p_tax_status,
    tax_invoice_date = case when p_tax_status = 'invoiced' then p_tax_date else null end,
    tax_invoice_memo = nullif(btrim(coalesce(p_memo, '')), '')
  where id = p_id
  returning * into v_row;

  -- 의뢰 done 재평가(공용 함수 — resolve_follow와 동일 규칙)
  perform public.service_request_reevaluate_done(v_row.service_request_id);
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.complete_service_report(uuid, text, date, text) from public, anon;
grant execute on function public.complete_service_report(uuid, text, date, text) to authenticated;

-- ── E. void_service_report — issued|approved 허용, completed 거부, child void 시 부모 reopen(D-C14) ──
create or replace function public.void_service_report(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_reports;
begin
  if not public.has_permission(v_uid, 'users.manage') then
    raise exception '리포트 무효화 권한이 없습니다(관리자 전용)' using errcode = 'insufficient_privilege';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception '무효화 사유가 필요합니다';
  end if;
  select * into v_row from public.service_reports where id = p_id for update;
  if not found then raise exception '존재하지 않는 리포트입니다'; end if;
  if v_row.status = 'completed' then
    raise exception '완료된 리포트는 무효화할 수 없습니다';
  end if;
  if v_row.status not in ('issued', 'approved') then
    raise exception '발행·승인된 리포트만 무효화할 수 있습니다';
  end if;

  perform set_config('app.service_reports_status_change', '1', true);
  update public.service_reports
    set status = 'voided', void_reason = left(btrim(p_reason), 500), voided_by = v_uid
    where id = p_id
    returning * into v_row;

  -- 후속 리포트를 무효화했고 다른 유효 child가 없으면 부모의 후속조치를 다시 연다
  if v_row.parent_report_id is not null and not exists (
       select 1 from public.service_reports ch
       where ch.parent_report_id = v_row.parent_report_id
         and ch.id <> v_row.id
         and ch.status in ('issued', 'approved', 'completed')
     ) then
    update public.service_reports
      set follow_resolved_at = null, follow_resolved_by = null
      where id = v_row.parent_report_id and status <> 'voided' and follow_needed;
  end if;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.void_service_report(uuid, text) from public, anon;
grant execute on function public.void_service_report(uuid, text) to authenticated;

-- ── I. enqueue_service_report_email — 승인본 수동 고객 발송(UC1). 발신자 = 호출자(견적 동형, D-C20) ──
create or replace function public.enqueue_service_report_email(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_reports;
  v_hiworks text;
  v_log_id uuid;
begin
  if not (public.has_permission(v_uid, 'email.send') or public.has_permission(v_uid, 'users.manage')) then
    raise exception '메일 발송 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  select * into v_row from public.service_reports where id = p_id for update;
  if not found then raise exception '존재하지 않는 리포트입니다'; end if;
  -- 행 조회 스코프(service_reports_select와 동일) — email.send만으로 uuid 추측 발송·수신처 탐지 차단
  if not (v_row.created_by = v_uid
          or public.has_permission(v_uid, 'users.manage')
          or public.has_permission(v_uid, 'service_reports.view_all')
          or public.has_permission(v_uid, 'service_reports.write')
          or public.has_permission(v_uid, 'service_reports.view')
          or public.has_permission(v_uid, 'service_reports.approve')
          or public.has_permission(v_uid, 'service_reports.complete')) then
    raise exception '리포트 조회 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  if v_row.status not in ('approved', 'completed') then
    raise exception '승인된 리포트만 고객에게 발송할 수 있습니다(현재: %)', v_row.status;
  end if;
  if v_row.pdf_url is null then raise exception '승인본 PDF가 아직 생성되지 않았습니다'; end if;
  if v_row.recipient_email is null then raise exception '수신 이메일이 없습니다'; end if;
  -- 발신자 = 호출자의 하이웍스 계정(타인 명의 발송 금지 — 기사 스냅샷 폴백 없음)
  select hiworks_user_id into v_hiworks from public.profiles where id = v_uid;
  if v_hiworks is null or btrim(v_hiworks) = '' then
    raise exception '발송자의 하이웍스 계정 ID가 설정되지 않았습니다 — 관리자에게 요청하세요';
  end if;
  begin
    insert into public.email_log (service_report_id, to_email, status, kind, from_user_id)
    values (v_row.id, v_row.recipient_email, 'pending', 'customer', v_uid)
    returning id into v_log_id;
  exception when unique_violation then
    raise exception '이미 발송 대기 중입니다';
  end;
  insert into public.jobs (type, payload)
  values ('service_report_email',
          jsonb_build_object('email_log_id', v_log_id, 'service_report_id', v_row.id, 'hiworks_user_id', v_hiworks));
  return jsonb_build_object('email_log_id', v_log_id, 'status', 'pending');
end;
$$;
revoke all on function public.enqueue_service_report_email(uuid) from public, anon;
grant execute on function public.enqueue_service_report_email(uuid) to authenticated;

-- ── J. service_report_kpis — 목록 상단 5박스(D-B8). 권한 무관 동일 숫자(DEFINER). KST 월 앵커 ──
create or replace function public.service_report_kpis()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_month_start timestamptz := (date_trunc('month', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul';
begin
  if not (public.has_permission(v_uid, 'service_reports.write')
          or public.has_permission(v_uid, 'service_reports.view')
          or public.has_permission(v_uid, 'service_reports.view_all')
          or public.has_permission(v_uid, 'service_reports.approve')
          or public.has_permission(v_uid, 'service_reports.complete')) then
    raise exception '리포트 조회 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'received', (select count(*) from public.service_requests where status in ('received', 'in_progress', 'on_hold')),
    'follow_open', (select count(*) from public.service_reports
                     where status in ('issued', 'approved', 'completed') and follow_needed and follow_resolved_at is null),
    'awaiting_approval', (select count(*) from public.service_reports where status = 'issued'),
    'awaiting_tax', (select count(*) from public.service_reports where status = 'approved'),
    'completed_this_month', (select count(*) from public.service_reports
                              where status = 'completed' and completed_at >= v_month_start)
  );
end;
$$;
revoke all on function public.service_report_kpis() from public, anon;
grant execute on function public.service_report_kpis() to authenticated;

-- ── K. get_service_report_approval_notice — 알림 이력 요약(승인자 이메일 노출 없이 count/time만, D-C27) ──
create or replace function public.get_service_report_approval_notice(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_reports;
begin
  select * into v_row from public.service_reports where id = p_id;
  if not found then raise exception '존재하지 않는 리포트입니다'; end if;
  -- service_reports_select RLS와 동일 조건
  if not (v_row.created_by = v_uid
          or public.has_permission(v_uid, 'service_reports.view_all')
          or (v_row.status in ('issued', 'approved', 'completed', 'voided')
              and (public.has_permission(v_uid, 'service_reports.write')
                   or public.has_permission(v_uid, 'service_reports.view')
                   or public.has_permission(v_uid, 'service_reports.approve')
                   or public.has_permission(v_uid, 'service_reports.complete')))) then
    raise exception '리포트 조회 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  return (
    select jsonb_build_object('sent_count', count(*) filter (where status = 'sent'), 'last_sent_at', max(sent_at))
      from public.email_log
      where service_report_id = p_id and kind = 'approval_notice'
  );
end;
$$;
revoke all on function public.get_service_report_approval_notice(uuid) from public, anon;
grant execute on function public.get_service_report_approval_notice(uuid) to authenticated;

-- ── F. resolve_service_report_follow — 발행 이후 3상태 허용 ──
create or replace function public.resolve_service_report_follow(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_reports;
begin
  if not (public.has_permission(v_uid, 'service_reports.write')
          or public.has_permission(v_uid, 'service_requests.status')) then
    raise exception '후속조치 처리 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  update public.service_reports
    set follow_resolved_at = now(), follow_resolved_by = v_uid
    where id = p_id and status in ('issued', 'approved', 'completed') and follow_needed and follow_resolved_at is null
    returning * into v_row;
  if not found then
    raise exception '처리할 후속조치가 없습니다';
  end if;
  -- #285: 완료된 리포트의 후속조치가 나중에 처리되면 의뢰 done을 재평가(그렇지 않으면 영원히 in_progress)
  perform public.service_request_reevaluate_done(v_row.service_request_id);
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.resolve_service_report_follow(uuid) from public, anon;
grant execute on function public.resolve_service_report_follow(uuid) to authenticated;

-- ── G. get_service_report_pdf_status — 권한 5키 ──
create or replace function public.get_service_report_pdf_status(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_reports;
  v_job record;
begin
  if not (public.has_permission(v_uid, 'service_reports.write')
          or public.has_permission(v_uid, 'service_reports.view')
          or public.has_permission(v_uid, 'service_reports.view_all')
          or public.has_permission(v_uid, 'service_reports.approve')
          or public.has_permission(v_uid, 'service_reports.complete')) then
    raise exception '리포트 조회 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  select * into v_row from public.service_reports where id = p_id;
  if not found then raise exception '존재하지 않는 리포트입니다'; end if;

  if v_row.pdf_url is not null then
    return jsonb_build_object('state', 'ready', 'pdf_url', v_row.pdf_url);
  end if;

  select j.status, j.last_error into v_job
    from public.jobs j
   where j.type = 'service_report_pdf'
     and j.payload ->> 'service_report_id' = p_id::text
   order by j.created_at desc
   limit 1;

  if not found then return jsonb_build_object('state', 'none'); end if;
  if v_job.status = 'failed' then
    return jsonb_build_object('state', 'failed', 'error', coalesce(v_job.last_error, '알 수 없는 오류'));
  end if;
  return jsonb_build_object('state', 'processing');
end;
$$;
revoke all on function public.get_service_report_pdf_status(uuid) from public, anon;
grant execute on function public.get_service_report_pdf_status(uuid) to authenticated;

-- ── H. retry_service_report_pdf — approved 허용·권한 확장·세대 payload ──
create or replace function public.retry_service_report_pdf(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.service_reports;
begin
  if not (public.has_permission(v_uid, 'service_reports.write')
          or public.has_permission(v_uid, 'service_reports.approve')
          or public.has_permission(v_uid, 'service_reports.complete')
          or public.has_permission(v_uid, 'users.manage')) then
    raise exception 'PDF 재시도 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  select * into v_row from public.service_reports where id = p_id;
  if not found then raise exception '존재하지 않는 리포트입니다'; end if;
  if v_row.status not in ('issued', 'approved') then raise exception '발행·승인된 리포트만 재시도할 수 있습니다'; end if;
  if v_row.pdf_url is not null then raise exception '이미 PDF가 생성되어 있습니다'; end if;
  if exists (
    select 1 from public.jobs
    where type = 'service_report_pdf'
      and payload ->> 'service_report_id' = p_id::text
      and status in ('queued', 'processing')
  ) then
    raise exception '이미 생성 작업이 진행 중입니다';
  end if;

  -- #285 세대·기대 상태를 실어 워커가 stale 결과를 폐기할 수 있게 한다(D-C8)
  insert into public.jobs (type, payload)
  values ('service_report_pdf',
          jsonb_build_object('service_report_id', p_id, 'revision', v_row.pdf_revision, 'expected_status', v_row.status));
  return jsonb_build_object('state', 'processing');
end;
$$;
revoke all on function public.retry_service_report_pdf(uuid) from public, anon;
grant execute on function public.retry_service_report_pdf(uuid) to authenticated;
