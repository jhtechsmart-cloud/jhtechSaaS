-- 서비스 리포트 RPC·잡 연동 — 이슈 #228 Part 1 (autoplan 보완 반영).
-- upsert(draft 저장, 금액 서버 재계산) / issue(FOR UPDATE 직렬화 + 부수효과) /
-- void(관리자 무효화) / list_open_service_requests(기사용 미종결 신청 조회 — RLS 홀 해소) /
-- PDF enqueue 트리거 / pdf_url 기록 시 메일 enqueue 트리거(unique_violation 흡수).

-- 0. email_log 확장 — 서비스 리포트 발송 연결 + 리포트당 활성 발송 1건(quote 패턴 미러).
alter table public.email_log
  add column if not exists service_report_id uuid references public.service_reports (id) on delete set null;
create index if not exists email_log_service_report_idx on public.email_log (service_report_id);
create unique index if not exists email_log_active_service_report
  on public.email_log (service_report_id)
  where status in ('pending', 'sending', 'sent');

-- 기존 SELECT 정책은 견적 권한만 커버 — 서비스 리포트 발송 행은 리포트 권한자도 열람 가능해야
-- 완료 화면·admin이 발송 상태를 보여줄 수 있다.
drop policy if exists email_log_select on public.email_log;
create policy email_log_select on public.email_log
  for select to authenticated
  using (
    (select public.has_permission((select auth.uid()), 'applications.view_all'))
    or (select public.has_permission((select auth.uid()), 'email.send'))
    or (
      service_report_id is not null
      and ((select public.has_permission((select auth.uid()), 'service_reports.write'))
           or (select public.has_permission((select auth.uid()), 'service_reports.view_all')))
    )
  );

-- 1. upsert_service_report — draft 생성/수정. 금액은 서버 재계산(VAT=round, 견적 엔진 동일 규칙).
-- 사진·서명 경로는 "이 리포트 폴더" 소속만 허용(첫 저장 전엔 리포트 id가 없어 사진·서명 불가 — 빈 배열 강제).
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
  v_req public.service_requests;
  v_email_re text := '^[^@[:space:],]+@[^@[:space:],]+\.[^@[:space:],]+$';
  v_faults text[];
  v_parts jsonb := coalesce(p -> 'parts', '[]'::jsonb);
  v_part jsonb;
  v_photos_before text[];
  v_photos_after text[];
  v_signature text;
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
    select ce.company_id, coalesce(e.name, ce.label), ce.serial_no, ce.purchased_at
      into v_equip_company, v_equip_name, v_equip_serial, v_equip_purchased
      from public.company_equipment ce
      left join public.equipment e on e.id = ce.equipment_id
      where ce.id = v_equipment_id;
    if not found then raise exception '존재하지 않는 보유장비입니다'; end if;
    if v_company_id is not null and v_equip_company is distinct from v_company_id then
      raise exception '보유장비가 선택한 고객의 것이 아닙니다';
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
      service_request_id, company_id, company_equipment_id,
      customer_name, customer_biz_no, customer_tel, customer_addr, recipient_email,
      device_name, device_serial, purchased_at,
      faults, diagnosis, action_text,
      follow_needed, follow_memo, follow_date,
      parts, charge_type, free_reason, visit_fee, overtime_fee, parts_total, vat, total,
      created_by
    ) values (
      v_request_id, v_company_id, v_equipment_id,
      v_cust_name, v_cust_biz, v_cust_tel, v_cust_addr, v_recip_final,
      v_dev_name, v_dev_serial, v_dev_purch,
      v_faults, left(coalesce(p ->> 'diagnosis', ''), 4000), left(coalesce(p ->> 'action_text', ''), 4000),
      coalesce((p ->> 'follow_needed')::boolean, false),
      left(coalesce(p ->> 'follow_memo', ''), 500), nullif(p ->> 'follow_date', '')::date,
      v_parts, v_charge, v_free_reason, v_visit, v_ot, v_parts_total, v_vat, v_total,
      v_uid
    ) returning * into v_row;
  else
    update public.service_reports set
      service_request_id = v_request_id,
      company_id = v_company_id,
      company_equipment_id = v_equipment_id,
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

-- 2. issue_service_report — 확정. FOR UPDATE 잠금으로 동시 확정 직렬화(부수효과 중복 차단).
-- 서명 실존 검증 → (신규 고객/장비 행 생성) → 신청 전이(가드 단문) → issued 전환 + 스냅샷.
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

  -- 직접입력 장비: company_equipment 행 생성(label 자유텍스트) — 이후 이력 누적 가능
  v_equipment_id := v_row.company_equipment_id;
  if v_equipment_id is null and btrim(coalesce(v_row.device_name, '')) <> '' then
    insert into public.company_equipment (company_id, label, serial_no, purchased_at)
    values (v_company_id, v_row.device_name, v_row.device_serial, v_row.purchased_at)
    returning id into v_equipment_id;
  end if;

  -- 연결 신청 전이 — 후속조치 없으면 done, 있으면 현 상태 유지. 종결 레이스는 no-op(확정 중단 금지).
  if v_row.service_request_id is not null and not v_row.follow_needed then
    update public.service_requests
      set status = 'done'
      where id = v_row.service_request_id and status not in ('done', 'canceled');
  end if;

  -- 엔지니어·발신자 스냅샷(발행 후 프로필이 바뀌어도 문서 불변)
  select * into v_profile from public.profiles where id = v_row.created_by;

  perform set_config('app.service_reports_status_change', '1', true);
  update public.service_reports set
    status = 'issued',
    issued_at = now(),
    company_id = v_company_id,
    company_equipment_id = v_equipment_id,
    engineer_name = left(coalesce(v_profile.name, ''), 60),
    engineer_title = v_profile.position,
    sender_hiworks_user_id = v_profile.hiworks_user_id
  where id = p_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;
revoke all on function public.issue_service_report(uuid) from public, anon;
grant execute on function public.issue_service_report(uuid) to authenticated;

-- 3. void_service_report — 발행본 무효화(관리자 전용, 사유 필수). 내용 수정은 여전히 불가.
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

  perform set_config('app.service_reports_status_change', '1', true);
  update public.service_reports
    set status = 'voided', void_reason = left(btrim(p_reason), 500), voided_by = v_uid
    where id = p_id and status = 'issued'
    returning * into v_row;
  if not found then
    raise exception '발행된 리포트만 무효화할 수 있습니다';
  end if;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.void_service_report(uuid, text) from public, anon;
grant execute on function public.void_service_report(uuid, text) to authenticated;

-- 4. resolve_service_report_follow — 후속조치 처리 완료(발행본 동결 예외 필드만 갱신).
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
    where id = p_id and status = 'issued' and follow_needed and follow_resolved_at is null
    returning * into v_row;
  if not found then
    raise exception '처리할 후속조치가 없습니다';
  end if;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.resolve_service_report_follow(uuid) from public, anon;
grant execute on function public.resolve_service_report_follow(uuid) to authenticated;

-- 5. list_open_service_requests — 기사용 미종결 신청 조회.
-- service_requests SELECT RLS는 assignee(영업)+view_all뿐이라 기사 계정은 0건 — DEFINER로 최소 필드만 개방.
create or replace function public.list_open_service_requests(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.has_permission(v_uid, 'service_reports.write') then
    raise exception '서비스 리포트 작성 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  if p_company_id is null then raise exception '고객을 선택해 주세요'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'seq_no', r.seq_no,
      'status', r.status,
      'created_at', r.created_at,
      'company_equipment_id', r.company_equipment_id,
      'symptom', r.fields ->> 'symptom'
    ) order by r.created_at desc)
    from public.service_requests r
    where r.company_id = p_company_id
      and r.status in ('received', 'in_progress', 'on_hold')
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.list_open_service_requests(uuid) from public, anon;
grant execute on function public.list_open_service_requests(uuid) to authenticated;

-- 6. 발행 → PDF 잡 enqueue (release_orders 패턴)
create or replace function public.service_reports_enqueue_pdf()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status is distinct from 'issued') then
    insert into public.jobs (type, payload)
    values ('service_report_pdf', jsonb_build_object('service_report_id', new.id));
  end if;
  return null;
end;
$$;
create trigger service_reports_enqueue_pdf_trg
  after insert or update on public.service_reports
  for each row execute function public.service_reports_enqueue_pdf();

-- 7. pdf_url 기록 → 메일 enqueue (PDF 잡과 분리 — 잡 재시도가 중복 발송으로 번지지 않게).
-- 수신 이메일·발신자 스냅샷이 있을 때만. 부분 유니크 충돌(이미 활성 발송 존재)은 성공으로 흡수.
create or replace function public.service_reports_enqueue_email()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_log_id uuid;
begin
  if new.pdf_url is not null and old.pdf_url is null
     and new.status = 'issued'
     and new.recipient_email is not null
     and new.sender_hiworks_user_id is not null then
    begin
      insert into public.email_log (service_report_id, to_email, status)
      values (new.id, new.recipient_email, 'pending')
      returning id into v_log_id;
      insert into public.jobs (type, payload)
      values ('service_report_email',
              jsonb_build_object('email_log_id', v_log_id, 'service_report_id', new.id));
    exception when unique_violation then
      null; -- 이미 활성 발송 존재(재시도/중복 트리거) — 멱등 성공
    end;
  end if;
  return null;
end;
$$;
create trigger service_reports_enqueue_email_trg
  after update on public.service_reports
  for each row execute function public.service_reports_enqueue_email();
