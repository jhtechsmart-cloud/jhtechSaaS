-- 롤백: create_manual_quote를 9-인자(company_id 포함)에서 8-인자(20260619100200) 정의로 되돌리고,
-- get_company_request_history의 applications 매칭에서 company_id 절 제거(20260604120000 정의 복원).

drop function if exists public.create_manual_quote(text, text, text, text, jsonb, jsonb, text, jsonb, uuid);

create or replace function public.create_manual_quote(
  p_company text,
  p_ceo text,
  p_phone text,
  p_email text,
  p_items jsonb,
  p_options jsonb,
  p_status text default 'draft',
  p_spec_selection jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company text := nullif(btrim(coalesce(p_company, '')), '');
  v_app_id uuid;
  v_row public.quotes;
begin
  if not public.has_permission(auth.uid(), 'quotes.write') then
    raise exception '견적 작성 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  if v_company is null then
    raise exception '회사명은 필수입니다';
  end if;

  insert into public.applications (company, ceo, phone, email, source, status, assignee_id)
  values (
    v_company,
    nullif(btrim(coalesce(p_ceo, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_email, '')), ''),
    'manual', 'quoted', auth.uid()
  )
  returning id into v_app_id;

  v_row := public._quote_insert(v_app_id, p_items, p_options, p_status, p_spec_selection);

  return jsonb_build_object('application_id', v_app_id, 'quote', to_jsonb(v_row));
end;
$$;
revoke all on function public.create_manual_quote(text, text, text, text, jsonb, jsonb, text, jsonb) from public, anon;
grant execute on function public.create_manual_quote(text, text, text, text, jsonb, jsonb, text, jsonb) to authenticated;

create or replace function public.get_company_request_history(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_biz text;
  v_source uuid;
  v_assignee uuid;
  v_uid uuid := (select auth.uid());
begin
  select nullif(regexp_replace(coalesce(biz_no, ''), '\D', '', 'g'), ''), source_application_id, assignee_id
    into v_biz, v_source, v_assignee
    from public.companies
    where id = p_company_id;

  if not (
    public.has_permission(v_uid, 'customers.view_all')
    or (public.has_permission(v_uid, 'customers.edit') and v_assignee = v_uid)
  ) then
    raise exception 'permission denied: customers.view_all or owning customer required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'applications', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', a.id, 'seq_no', a.seq_no, 'company', a.company,
                 'status', a.status, 'created_at', a.created_at
               )
               order by a.created_at desc
             )
      from public.applications a
      where (v_biz is not null and regexp_replace(coalesce(a.biz_no, ''), '\D', '', 'g') = v_biz)
         or (v_source is not null and a.id = v_source)
    ), '[]'::jsonb),

    'service_requests', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', s.id, 'seq_no', s.seq_no, 'status', s.status,
                 'company_equipment_id', s.company_equipment_id, 'created_at', s.created_at
               )
               order by s.created_at desc
             )
      from public.service_requests s
      where s.company_id = p_company_id
    ), '[]'::jsonb),

    'supply_requests', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', sr.id, 'seq_no', sr.seq_no, 'status', sr.status, 'created_at', sr.created_at,
                 'item_count', (select count(*)::int from public.supply_request_items i where i.request_id = sr.id),
                 'items', coalesce((
                   select jsonb_agg(
                            jsonb_build_object('consumable_name_snapshot', i.consumable_name_snapshot, 'qty', i.qty)
                            order by i.created_at
                          )
                   from public.supply_request_items i
                   where i.request_id = sr.id
                 ), '[]'::jsonb)
               )
               order by sr.created_at desc
             )
      from public.supply_requests sr
      where sr.company_id = p_company_id
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_company_request_history(uuid) from public;
grant execute on function public.get_company_request_history(uuid) to authenticated;
