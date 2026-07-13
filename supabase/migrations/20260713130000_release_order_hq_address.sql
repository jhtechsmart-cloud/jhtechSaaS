-- 출고의뢰서 본사주소 스냅샷 컬럼. 설치주소(install_address)와 별개로 발행 시점 본사주소를 보존.
-- PDF에는 설치주소만 표시(워커 무변경). 본사주소는 폼/이력 보존·역반영용.
alter table public.release_orders add column if not exists hq_address text;

-- 발행본 동결 트리거 재정의 — hq_address도 issued 동결 목록에 추가(버전관리 트리거 최신본 기준).
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
       or new.hq_address is distinct from old.hq_address
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

-- RPC 재정의 — p_hq_address 추가(10-arg). 기존 9-arg 오버로드 drop 후 통합.
-- ⚠️ p_hq_address는 **맨 끝(10번째)** 에 추가한다 — 기존 positional 호출(3-arg/6-arg/9-arg,
-- db-tests 포함)이 그대로 같은 파라미터에 매핑되도록(원본 마이그의 하위호환 원칙 유지).
-- 웹 액션은 named-arg(p_hq_address:=)로 호출하므로 위치와 무관.
drop function if exists public.upsert_release_order(uuid, text, jsonb, text, text, text, text, text, text);

create or replace function public.upsert_release_order(
  p_application_id uuid,
  p_device_kind text,
  p_details jsonb,
  p_company text default null,
  p_contact_phone text default null,
  p_install_address text default null,  -- 설치주소 — 빈 값이면 의뢰주소 폴백
  p_device_name text default null,
  p_install_date text default null,     -- 'YYYY-MM-DD' (빈 값이면 견적 납품일 폴백)
  p_install_time text default null,     -- 'HH:mm'      (빈 값이면 자정)
  p_hq_address text default null        -- 본사주소(신규·맨끝) — 빈 값이면 의뢰주소 폴백
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_app public.applications;
  v_quote public.quotes;
  v_install_at timestamptz;
  v_device_name text;
  v_company text;
  v_phone text;
  v_hq text;
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

  if nullif(btrim(coalesce(p_install_date, '')), '') is not null then
    v_install_at := (p_install_date || ' ' || coalesce(nullif(btrim(p_install_time), ''), '00:00'))::timestamp
      at time zone 'Asia/Seoul';
  elsif v_quote.delivery_date is not null then
    v_install_at := (v_quote.delivery_date::text || ' ' || coalesce(v_quote.delivery_time::text, '00:00:00'))::timestamp
      at time zone 'Asia/Seoul';
  end if;

  v_device_name := coalesce(
    nullif(btrim(coalesce(p_device_name, '')), ''),
    nullif(btrim(coalesce(v_quote.items -> 0 ->> 'name', '')), '')
  );

  v_company := left(coalesce(nullif(btrim(coalesce(p_company, '')), ''), v_app.company), 200);
  v_phone := left(coalesce(nullif(btrim(coalesce(p_contact_phone, '')), ''), v_app.phone), 50);
  v_hq := left(coalesce(nullif(btrim(coalesce(p_hq_address, '')), ''), v_app.address), 1000);
  v_address := left(coalesce(nullif(btrim(coalesce(p_install_address, '')), ''), v_app.address), 1000);

  select * into v_latest from public.release_orders
    where application_id = p_application_id
    order by version desc limit 1;

  if found and v_latest.status = 'draft' then
    update public.release_orders set
      quote_id = v_quote.id, device_kind = p_device_kind,
      company = v_company, contact_phone = v_phone,
      hq_address = v_hq, install_address = v_address,
      install_at = v_install_at, device_name = v_device_name,
      details = coalesce(p_details, '{}'::jsonb)
    where id = v_latest.id
    returning * into v_row;
  else
    insert into public.release_orders (
      application_id, version, quote_id, device_kind, status,
      company, contact_phone, hq_address, install_address, install_at, device_name, details, created_by
    )
    values (
      p_application_id, coalesce(v_latest.version, 0) + 1, v_quote.id, p_device_kind, 'draft',
      v_company, v_phone, v_hq, v_address, v_install_at, v_device_name,
      coalesce(p_details, '{}'::jsonb), v_uid
    )
    returning * into v_row;
  end if;

  return to_jsonb(v_row);
end;
$$;
revoke all on function public.upsert_release_order(uuid, text, jsonb, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.upsert_release_order(uuid, text, jsonb, text, text, text, text, text, text, text) to authenticated;
