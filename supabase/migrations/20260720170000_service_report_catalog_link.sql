-- AS 히스토리 Part 1a — 카탈로그 링크 · 보유장비 중복 방지 · 소급 연결 (#242)
--
-- 왜: 리포트가 카탈로그 장비와 끊겨 있어 "이 고객의 이 장비, 지난번에 뭐 했더라"에 답할 수 없다.
-- 더 급한 문제: 확정 RPC가 company_equipment를 무조건 INSERT 해서, 현장 카탈로그 피커로 고를 때마다
-- 같은 고객·같은 장비의 행이 새로 생긴다(이력 분할 + 통계 분모 팽창).
--
-- 적용 순서(의존): ①match 함수 → ②백업 테이블 → ③소급 연결 → ④컬럼 → ⑤RPC 재정의
-- 통계 원본 = service_reports.catalog_equipment_id 단일. company_equipment.equipment_id는 자산관리용.

-- ─────────────────────────────────────────────────────────────
-- ① 카탈로그 이름 매칭 — RPC·소급 마이그레이션 공용(정규식 1벌).
--    packages/shared/src/equipment-match.ts의 normalizeEquipmentKey와 동일 규칙:
--    소문자화 + 영숫자/한글만 남김. name 또는 model 완전일치.
--    0건·2건 이상이면 null(추측 연결 금지 — 미연결이 오연결보다 안전).
create or replace function public.match_catalog_equipment(p_name text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with k as (
    select regexp_replace(lower(btrim(coalesce(p_name, ''))), '[^0-9a-z가-힣]', '', 'g') as key
  ), m as (
    select e.id
      from public.equipment e, k
     where k.key <> ''
       and e.status = 'active'
       and (
         regexp_replace(lower(e.name), '[^0-9a-z가-힣]', '', 'g') = k.key
         or (e.model is not null
             and regexp_replace(lower(e.model), '[^0-9a-z가-힣]', '', 'g') = k.key)
       )
  )
  -- uuid에는 min() 집계가 없다. 유일 매칭일 때만 그 id를 돌려준다.
  select case when count(*) = 1 then (array_agg(m.id))[1] end from m;
$$;
revoke all on function public.match_catalog_equipment(text) from public, anon;
grant execute on function public.match_catalog_equipment(text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- ② 소급 연결 백업 — company_equipment_identity(XOR)가 equipment_id와 label 동시 보유를 막으므로
--    연결 시 label을 비워야 한다. 원문을 여기 스냅샷해 롤백이 문자열 파싱에 의존하지 않게 한다.
create table if not exists public.company_equipment_link_backup (
  company_equipment_id uuid primary key
    references public.company_equipment(id) on delete cascade,
  old_label text not null,
  linked_equipment_id uuid not null references public.equipment(id),
  created_at timestamptz not null default now()
);
alter table public.company_equipment_link_backup enable row level security;
-- 운영 백업 테이블: 애플리케이션 접근 없음(service_role·마이그레이션 전용). 정책 없음 = 전면 거부.
comment on table public.company_equipment_link_backup is
  'AS 히스토리 1a 소급 연결 전 label 스냅샷. 롤백 전용, 앱 접근 없음.';

-- ─────────────────────────────────────────────────────────────
-- ③ 소급 연결 — 이름만 있는 보유장비를 카탈로그에 연결(유일 매칭일 때만).
--    같은 match 함수를 쓰므로 RPC와 규칙이 갈라지지 않는다(status='active' 포함).
do $$
declare
  v_row record;
  v_hit uuid;
  v_linked int := 0;
  v_skipped int := 0;
begin
  for v_row in
    select id, label from public.company_equipment
     where equipment_id is null and btrim(coalesce(label, '')) <> ''
     order by created_at
  loop
    v_hit := public.match_catalog_equipment(v_row.label);
    if v_hit is null then
      v_skipped := v_skipped + 1;
      raise notice '[1a backfill] 미연결(0건 또는 다중매칭): %', v_row.label;
      continue;
    end if;
    insert into public.company_equipment_link_backup (company_equipment_id, old_label, linked_equipment_id)
    values (v_row.id, v_row.label, v_hit)
    on conflict (company_equipment_id) do nothing;
    -- XOR 제약 충족: 같은 문장에서 equipment_id set + label null
    update public.company_equipment
       set equipment_id = v_hit, label = null, updated_at = now()
     where id = v_row.id;
    v_linked := v_linked + 1;
    raise notice '[1a backfill] 연결: % -> %', v_row.label, v_hit;
  end loop;
  raise notice '[1a backfill] 완료 — 연결 %건, 미연결 %건', v_linked, v_skipped;
end $$;

-- ─────────────────────────────────────────────────────────────
-- ④ 리포트의 카탈로그 링크 — 모델 단위 집계의 단일 원본.
--    확정 시 항상 채워지고(해석 불가 시에만 null) 이후 동결 트리거가 고정한다.
--    ⚠️ 동결 화이트리스트에 추가 금지 — 발행본 통계 원본이 수정 가능해지면 안 된다.
alter table public.service_reports
  add column if not exists catalog_equipment_id uuid
    references public.equipment(id) on delete restrict;
create index if not exists service_reports_catalog_equipment_idx
  on public.service_reports (catalog_equipment_id, status);
comment on column public.service_reports.catalog_equipment_id is
  '카탈로그 장비 링크(모델 단위 집계 단일 원본). 확정 시 서버가 해석해 기록, 이후 동결.';

-- ─────────────────────────────────────────────────────────────
-- ⑤ RPC 재정의 — 최신 정의(20260716170100) 전체를 옮기고 아래 표시된 부분만 변경.

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
      created_by
    ) values (
      v_request_id, v_company_id, v_equipment_id, v_catalog_id,
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

  -- 연결 신청 전이 — 후속조치 없으면 done, 있으면 현 상태 유지. 종결 레이스는 no-op(확정 중단 금지).
  if v_row.service_request_id is not null and not v_row.follow_needed then
    update public.service_requests
      set status = 'done'
      where id = v_row.service_request_id and status not in ('done', 'canceled');
  end if;

  -- 엔지니어·발신자 스냅샷(발행 후 프로필이 바뀌어도 문서 불변)
  select * into v_profile from public.profiles where id = v_row.created_by;

  -- ⚠️ [1a] catalog_equipment_id는 반드시 이 status 전환 UPDATE에 합쳐 쓴다.
  -- 동결 트리거는 `old.status = 'issued'`일 때만 화이트리스트를 검사하므로(draft→issued 전환은
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

  return to_jsonb(v_row);
end;
$$;
revoke all on function public.issue_service_report(uuid) from public, anon;
grant execute on function public.issue_service_report(uuid) to authenticated;

