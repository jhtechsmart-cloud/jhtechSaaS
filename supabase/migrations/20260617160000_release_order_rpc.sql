-- 장비출고의뢰서 작성/발행 RPC (Phase 3a).
-- 견적 RPC 패턴 재사용: SECURITY DEFINER가 RLS를 우회하므로 release_orders.write + 행 스코프를 명시 검사.
-- 스냅샷(company·contact_phone·install_address·install_at·device_name·quote_id)은
-- 서버가 application/최신 발행 quote에서 채운다(클라 미신뢰).

-- 0. 발행 시 PDF 잡 enqueue 트리거 — 'issued'로 전환될 때만 release_pdf 잡 1건(견적 quotes_enqueue_pdf 패턴).
create or replace function public.release_orders_enqueue_pdf()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status is distinct from 'issued') then
    insert into public.jobs (type, payload)
    values ('release_pdf', jsonb_build_object('release_order_id', new.id));
  end if;
  return null; -- AFTER 트리거
end;
$$;

create trigger release_orders_enqueue_pdf_trg
  after insert or update on public.release_orders
  for each row execute function public.release_orders_enqueue_pdf();

-- 1. upsert_release_order — 의뢰 1:1 draft 작성/갱신.
-- 클라는 device_kind·details(작성 입력)만 보낸다. 스냅샷은 서버가 application/quote에서 채움.
create or replace function public.upsert_release_order(
  p_application_id uuid,
  p_device_kind text,
  p_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_app public.applications;
  v_quote public.quotes;
  v_install_at timestamptz;
  v_device_name text;
  v_row public.release_orders;
begin
  -- 권한
  if not public.has_permission(v_uid, 'release_orders.write') then
    raise exception '출고의뢰서 작성 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;

  -- device_kind 검증(테이블 CHECK와 동일 — 친절한 메시지로 선차단)
  if p_device_kind is null or p_device_kind not in ('printer', 'cutter') then
    raise exception 'device_kind는 printer 또는 cutter여야 합니다: %', p_device_kind;
  end if;

  -- details는 JSON 객체(상세 구조 검증은 shared Zod가 클라에서 — 견적 items와 동일 경계).
  -- 단 크기 상한은 서버가 강제(클라 검증 우회 방지 — 메일 본문 캡 패턴). 비대 jsonb 차단.
  if jsonb_typeof(coalesce(p_details, '{}'::jsonb)) is distinct from 'object' then
    raise exception 'details는 JSON 객체여야 합니다';
  end if;
  if octet_length(coalesce(p_details, '{}'::jsonb)::text) > 20000 then
    raise exception 'details가 너무 큽니다(최대 20KB)';
  end if;

  -- 의뢰 조회 + 행 스코프(배정 본인 또는 전체열람)
  select * into v_app from public.applications where id = p_application_id;
  if not found then
    raise exception '존재하지 않는 의뢰입니다: %', p_application_id;
  end if;
  if not (v_app.assignee_id = v_uid or public.has_permission(v_uid, 'applications.view_all')) then
    raise exception '이 의뢰에 접근 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;

  -- 최신 발행 견적(스냅샷 출처). 없으면 device_name/install_at/quote_id는 null.
  select * into v_quote from public.quotes
    where application_id = p_application_id and status = 'issued'
    order by version desc limit 1;

  -- 납품일정(date+time) → install_at(KST). 시간 없으면 자정. 날짜 없으면 null.
  if v_quote.delivery_date is not null then
    v_install_at := (v_quote.delivery_date::text || ' ' || coalesce(v_quote.delivery_time::text, '00:00:00'))::timestamp
      at time zone 'Asia/Seoul';
  end if;
  v_device_name := nullif(btrim(coalesce(v_quote.items -> 0 ->> 'name', '')), '');

  -- 발행본은 수정 불가 — 불변 트리거가 최종 차단하지만 친절한 메시지로 선검사.
  if exists (
    select 1 from public.release_orders
    where application_id = p_application_id and status = 'issued'
  ) then
    raise exception '발행된 출고의뢰서는 수정할 수 없습니다';
  end if;

  -- 1:1 원자적 upsert(동시 호출/더블클릭 TOCTOU 방지). UNIQUE(application_id) 전체 제약이라 ON CONFLICT 동작.
  -- status·created_by·created_at·seq_no는 갱신 대상에서 제외(draft 유지·최초 작성자·채번 보존, 트리거가 강제).
  insert into public.release_orders (
    application_id, quote_id, device_kind, status,
    company, contact_phone, install_address, install_at, device_name, details, created_by
  )
  values (
    p_application_id, v_quote.id, p_device_kind, 'draft',
    v_app.company, v_app.phone, v_app.address, v_install_at, v_device_name,
    coalesce(p_details, '{}'::jsonb), v_uid
  )
  on conflict (application_id) do update set
    quote_id = excluded.quote_id,
    device_kind = excluded.device_kind,
    company = excluded.company,
    contact_phone = excluded.contact_phone,
    install_address = excluded.install_address,
    install_at = excluded.install_at,
    device_name = excluded.device_name,
    details = excluded.details
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;
revoke all on function public.upsert_release_order(uuid, text, jsonb) from public, anon;
grant execute on function public.upsert_release_order(uuid, text, jsonb) to authenticated;

-- 2. issue_release_order — draft→issued. enqueue 트리거가 release_pdf 잡을 생성.
create or replace function public.issue_release_order(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.release_orders;
  v_app_assignee uuid;
begin
  if not public.has_permission(v_uid, 'release_orders.write') then
    raise exception '출고의뢰서 발행 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.release_orders where id = p_id;
  if not found then
    raise exception '존재하지 않는 출고의뢰서입니다: %', p_id;
  end if;

  -- 행 스코프(배정 본인 또는 전체열람)
  select assignee_id into v_app_assignee from public.applications where id = v_row.application_id;
  if not (v_app_assignee = v_uid or public.has_permission(v_uid, 'applications.view_all')) then
    raise exception '이 출고의뢰서에 접근 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;

  if v_row.status = 'issued' then
    raise exception '이미 발행된 출고의뢰서입니다';
  end if;

  -- 발행 전제: 연결된 견적과 설치 일시가 있어야 함(빈 껍데기 출고의뢰서 발행 차단).
  -- 클라 버튼 disable과 같은 규칙을 서버가 최종 강제.
  if v_row.quote_id is null then
    raise exception '연결된 견적이 없어 발행할 수 없습니다';
  end if;
  if v_row.install_at is null then
    raise exception '설치 일시가 없어 발행할 수 없습니다';
  end if;

  update public.release_orders set status = 'issued', issued_at = now()
    where id = p_id
    returning * into v_row;

  return to_jsonb(v_row);
end;
$$;
revoke all on function public.issue_release_order(uuid) from public, anon;
grant execute on function public.issue_release_order(uuid) to authenticated;
