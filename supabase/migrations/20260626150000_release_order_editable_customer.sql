-- 출고의뢰서 고객정보(회사·연락처·설치주소) 편집 가능화.
-- 지금까지 company/contact_phone/install_address는 서버가 application에서만 채웠으나(클라 미신뢰),
-- 담당자가 출고의뢰서에서 직접 수정할 수 있도록 upsert RPC가 클라 값을 받아 저장한다.
--   - 클라 값이 있으면 그 값을, 비었으면 application 값으로 폴백(안전망).
--   - install_at·device_name·quote_id는 견적 기반이라 여전히 서버가 채움(편집 대상 아님).
-- 인자 3개 추가 = 새 시그니처라 기존 3-인자 함수 drop 후 6-인자로 재생성(20260617160000 본문 기준).

drop function if exists public.upsert_release_order(uuid, text, jsonb);

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

  -- 고객정보 = 클라 편집값 우선, 비면 application 폴백. 길이 상한(name 200·phone 50·addr 500은 느슨히 1000).
  v_company := left(coalesce(nullif(btrim(coalesce(p_company, '')), ''), v_app.company), 200);
  v_phone := left(coalesce(nullif(btrim(coalesce(p_contact_phone, '')), ''), v_app.phone), 50);
  v_address := left(coalesce(nullif(btrim(coalesce(p_install_address, '')), ''), v_app.address), 1000);

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
    v_company, v_phone, v_address, v_install_at, v_device_name,
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
revoke all on function public.upsert_release_order(uuid, text, jsonb, text, text, text) from public, anon;
grant execute on function public.upsert_release_order(uuid, text, jsonb, text, text, text) to authenticated;
