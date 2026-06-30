-- 롤백: 9-arg upsert_release_order(장비명·설치일시 직접입력)을 제거하고
-- 직전 6-arg 본(20260626160000 버전 — install_at/device_name을 견적에서 강제)으로 복원.
drop function if exists public.upsert_release_order(uuid, text, jsonb, text, text, text, text, text, text);

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

  select * into v_latest from public.release_orders
    where application_id = p_application_id
    order by version desc limit 1;

  if found and v_latest.status = 'draft' then
    update public.release_orders set
      quote_id = v_quote.id, device_kind = p_device_kind,
      company = v_company, contact_phone = v_phone, install_address = v_address,
      install_at = v_install_at, device_name = v_device_name,
      details = coalesce(p_details, '{}'::jsonb)
    where id = v_latest.id
    returning * into v_row;
  else
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
