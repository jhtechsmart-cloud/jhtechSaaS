-- 출고의뢰서 버전관리 — 견적(quotes) 버전 패턴 미러.
-- 지금까지 의뢰 1:1(UNIQUE application_id) + 발행본 잠금이었으나,
-- 발행 후에도 수정 가능하게 하되 이력을 보존하도록 버전을 도입한다.
--   - version int + UNIQUE(application_id, version). 같은 의뢰의 여러 버전 행 허용.
--   - seq_no는 버전 간 공유(같은 출고번호, 표시 시 'V{version}' 부가).
--   - 발행본(issued) 버전은 그대로 불변(트리거). '수정'하면 새 draft 버전이 생성된다.
--   - 각 버전은 자체 PDF(행 id별 {id}.pdf)를 가져 이력·PDF 모두 보존.

-- 1. version 컬럼 추가(기존 행은 모두 1).
alter table public.release_orders
  add column version int not null default 1;

-- 2. 1:1 UNIQUE(application_id) 해제 → (application_id, version) 복합 UNIQUE.
do $$
declare v_con text;
begin
  select conname into v_con
    from pg_constraint
    where conrelid = 'public.release_orders'::regclass
      and contype = 'u'
      and conkey = array[(select attnum from pg_attribute
                          where attrelid = 'public.release_orders'::regclass and attname = 'application_id')];
  if v_con is not null then
    execute format('alter table public.release_orders drop constraint %I', v_con);
  end if;
end $$;
alter table public.release_orders
  add constraint release_orders_app_version_key unique (application_id, version);
create index if not exists release_orders_app_version_idx on public.release_orders (application_id, version desc);

-- 3. BEFORE INSERT 트리거 — seq_no를 같은 의뢰의 기존 버전과 공유(없으면 새 채번).
create or replace function public.release_orders_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_existing text;
begin
  select seq_no into v_existing from public.release_orders
    where application_id = new.application_id
    order by version limit 1;
  if v_existing is not null then
    new.seq_no := v_existing; -- 버전 간 출고번호 공유
  else
    new.seq_no := 'REL-' || to_char((now() at time zone 'Asia/Seoul'), 'YYYYMMDD')
      || '-' || lpad(nextval('public.release_order_seq')::text, 5, '0');
  end if;
  new.created_at := now();
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end; $$;

-- 4. BEFORE UPDATE 트리거 — version도 동결(불변). 발행본 동결은 유지.
create or replace function public.release_orders_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.seq_no := old.seq_no;
  new.created_at := old.created_at;
  new.version := old.version; -- 버전 불변
  if old.status = 'issued' then
    if new.application_id is distinct from old.application_id
       or new.quote_id is distinct from old.quote_id
       or new.device_kind is distinct from old.device_kind
       or new.status is distinct from old.status
       or new.company is distinct from old.company
       or new.contact_phone is distinct from old.contact_phone
       or new.install_address is distinct from old.install_address
       or new.install_at is distinct from old.install_at
       or new.device_name is distinct from old.device_name
       or new.details is distinct from old.details
       or new.created_by is distinct from old.created_by then
      raise exception '발행된 출고의뢰서 버전은 수정할 수 없습니다(새 버전으로 저장됩니다)';
    end if;
  end if;
  return new;
end; $$;

-- 5. upsert_release_order 재정의 — 버전 인지.
--    최신 버전이 draft면 그 행을 수정, 아니면(발행본이거나 없음) 새 draft 버전 생성.
--    (20260626150000 본문 기준 — 고객정보 인자 보존.)
create or replace function public.upsert_release_order(
  p_application_id uuid,
  p_device_kind text,
  p_details jsonb,
  p_company text default null,
  p_contact_phone text default null,
  p_install_address text default null
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
  v_company text;
  v_phone text;
  v_address text;
  v_latest public.release_orders;
  v_row public.release_orders;
begin
  if not public.has_permission(v_uid, 'release_orders.write') then
    raise exception '출고의뢰서 작성 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  if p_device_kind is null or p_device_kind not in ('printer', 'cutter') then
    raise exception 'device_kind는 printer 또는 cutter여야 합니다: %', p_device_kind;
  end if;
  if jsonb_typeof(coalesce(p_details, '{}'::jsonb)) is distinct from 'object' then
    raise exception 'details는 JSON 객체여야 합니다';
  end if;
  if octet_length(coalesce(p_details, '{}'::jsonb)::text) > 20000 then
    raise exception 'details가 너무 큽니다(최대 20KB)';
  end if;

  select * into v_app from public.applications where id = p_application_id;
  if not found then
    raise exception '존재하지 않는 의뢰입니다: %', p_application_id;
  end if;
  if not (v_app.assignee_id = v_uid or public.has_permission(v_uid, 'applications.view_all')) then
    raise exception '이 의뢰에 접근 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;

  select * into v_quote from public.quotes
    where application_id = p_application_id and status = 'issued'
    order by version desc limit 1;
  if v_quote.delivery_date is not null then
    v_install_at := (v_quote.delivery_date::text || ' ' || coalesce(v_quote.delivery_time::text, '00:00:00'))::timestamp
      at time zone 'Asia/Seoul';
  end if;
  v_device_name := nullif(btrim(coalesce(v_quote.items -> 0 ->> 'name', '')), '');

  v_company := left(coalesce(nullif(btrim(coalesce(p_company, '')), ''), v_app.company), 200);
  v_phone := left(coalesce(nullif(btrim(coalesce(p_contact_phone, '')), ''), v_app.phone), 50);
  v_address := left(coalesce(nullif(btrim(coalesce(p_install_address, '')), ''), v_app.address), 1000);

  -- 최신 버전 조회.
  select * into v_latest from public.release_orders
    where application_id = p_application_id
    order by version desc limit 1;

  if found and v_latest.status = 'draft' then
    -- 최신이 draft → 그 버전을 제자리 수정.
    update public.release_orders set
      quote_id = v_quote.id, device_kind = p_device_kind,
      company = v_company, contact_phone = v_phone, install_address = v_address,
      install_at = v_install_at, device_name = v_device_name,
      details = coalesce(p_details, '{}'::jsonb)
    where id = v_latest.id
    returning * into v_row;
  else
    -- 최신이 발행본이거나 없음 → 새 draft 버전 생성(seq_no는 트리거가 공유).
    insert into public.release_orders (
      application_id, version, quote_id, device_kind, status,
      company, contact_phone, install_address, install_at, device_name, details, created_by
    )
    values (
      p_application_id, coalesce(v_latest.version, 0) + 1, v_quote.id, p_device_kind, 'draft',
      v_company, v_phone, v_address, v_install_at, v_device_name,
      coalesce(p_details, '{}'::jsonb), v_uid
    )
    returning * into v_row;
  end if;

  return to_jsonb(v_row);
end;
$$;
revoke all on function public.upsert_release_order(uuid, text, jsonb, text, text, text) from public, anon;
grant execute on function public.upsert_release_order(uuid, text, jsonb, text, text, text) to authenticated;
