-- 롤백: 20260626160000_release_order_versioning
-- ⚠️ 다중 버전이 생성된 뒤 롤백하면 UNIQUE(application_id) 복원이 실패한다.
--    먼저 의뢰별 최신 버전만 남기고 정리해야 한다(예: 아래 주석 참고).
--    delete from public.release_orders ro using (
--      select application_id, max(version) v from public.release_orders group by application_id
--    ) keep where ro.application_id = keep.application_id and ro.version < keep.v;

alter table public.release_orders drop constraint if exists release_orders_app_version_key;
drop index if exists public.release_orders_app_version_idx;

-- BEFORE INSERT — seq_no 항상 새 채번(공유 없음).
create or replace function public.release_orders_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.seq_no := 'REL-' || to_char((now() at time zone 'Asia/Seoul'), 'YYYYMMDD')
    || '-' || lpad(nextval('public.release_order_seq')::text, 5, '0');
  new.created_at := now();
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end; $$;

-- BEFORE UPDATE — version 동결 제거(컬럼이 곧 삭제됨).
create or replace function public.release_orders_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.seq_no := old.seq_no;
  new.created_at := old.created_at;
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
      raise exception '발행된 출고의뢰서는 수정할 수 없습니다(pdf_url만 갱신 가능)';
    end if;
  end if;
  return new;
end; $$;

alter table public.release_orders drop column if exists version;
alter table public.release_orders add constraint release_orders_application_id_key unique (application_id);

-- upsert RPC를 20260626150000(고객정보 인자 + 발행본 차단) 본문으로 복원.
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
