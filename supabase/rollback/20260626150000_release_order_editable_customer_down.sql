-- 롤백: 20260626150000_release_order_editable_customer
-- 6-인자 함수 drop 후 3-인자 원본(20260617160000) 복원.
drop function if exists public.upsert_release_order(uuid, text, jsonb, text, text, text);

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
  if exists (
    select 1 from public.release_orders
    where application_id = p_application_id and status = 'issued'
  ) then
    raise exception '발행된 출고의뢰서는 수정할 수 없습니다';
  end if;
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
