-- E5a #38 step2 롤백 — customers 도메인 RLS·RPC를 P-B 원상태(customers.manage, 전원 SELECT)로 복원.

-- ── companies 정책 원복 ──
drop policy if exists companies_select on public.companies;
drop policy if exists companies_insert on public.companies;
drop policy if exists companies_update on public.companies;
drop policy if exists companies_delete on public.companies;

create policy companies_select on public.companies
  for select to authenticated using (true);
create policy companies_insert on public.companies
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'customers.manage')));
create policy companies_update on public.companies
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'customers.manage')))
  with check ((select public.has_permission((select auth.uid()), 'customers.manage')));
create policy companies_delete on public.companies
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'customers.manage')));

-- ── company_equipment 정책 원복 ──
drop policy if exists company_equipment_select on public.company_equipment;
drop policy if exists company_equipment_insert on public.company_equipment;
drop policy if exists company_equipment_update on public.company_equipment;
drop policy if exists company_equipment_delete on public.company_equipment;

create policy company_equipment_select on public.company_equipment
  for select to authenticated using (true);
create policy company_equipment_insert on public.company_equipment
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'customers.manage')));
create policy company_equipment_update on public.company_equipment
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'customers.manage')))
  with check ((select public.has_permission((select auth.uid()), 'customers.manage')));
create policy company_equipment_delete on public.company_equipment
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'customers.manage')));

-- ── RPC 게이트 원복 (customers.manage) ──
create or replace function public.upsert_company_from_application(p_application_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_app public.applications%rowtype;
  v_biz text;
  v_company_id uuid;
  v_created boolean := false;
begin
  if not public.has_permission((select auth.uid()), 'customers.manage') then
    raise exception 'permission denied: customers.manage required' using errcode = '42501';
  end if;
  select * into v_app from public.applications where id = p_application_id;
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;
  v_biz := nullif(regexp_replace(coalesce(v_app.biz_no, ''), '\D', '', 'g'), '');
  if v_biz is not null then
    select id into v_company_id from public.companies where biz_no = v_biz;
  else
    select id into v_company_id from public.companies where source_application_id = p_application_id;
  end if;
  if v_company_id is null then
    begin
      insert into public.companies (biz_no, name, ceo, phone, email, address, assignee_id, source_application_id)
      values (
        v_biz, v_app.company,
        nullif(btrim(v_app.ceo), ''), nullif(btrim(v_app.phone), ''),
        nullif(btrim(v_app.email), ''), nullif(btrim(v_app.address), ''),
        v_app.assignee_id, p_application_id
      )
      returning id into v_company_id;
      v_created := true;
    exception when unique_violation then
      if v_biz is not null then
        select id into v_company_id from public.companies where biz_no = v_biz;
      else
        select id into v_company_id from public.companies where source_application_id = p_application_id;
      end if;
    end;
  else
    update public.companies set
      ceo = coalesce(ceo, nullif(btrim(v_app.ceo), '')),
      phone = coalesce(phone, nullif(btrim(v_app.phone), '')),
      email = coalesce(email, nullif(btrim(v_app.email), '')),
      address = coalesce(address, nullif(btrim(v_app.address), ''))
    where id = v_company_id;
  end if;
  return jsonb_build_object('company_id', v_company_id, 'created', v_created);
end;
$$;
revoke all on function public.upsert_company_from_application(uuid) from public;
grant execute on function public.upsert_company_from_application(uuid) to authenticated;

create or replace function public.search_applications_for_customer(p_query text)
returns table (id uuid, seq_no text, company text, biz_no text, ceo text, phone text, email text, created_at timestamptz)
language plpgsql security definer set search_path = '' stable as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
  v_digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  v_like text;
begin
  if not public.has_permission((select auth.uid()), 'customers.manage') then
    raise exception 'permission denied: customers.manage required' using errcode = '42501';
  end if;
  if char_length(v_q) < 2 or char_length(v_q) > 200 then return; end if;
  v_like := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select a.id, a.seq_no, a.company, a.biz_no, a.ceo, a.phone, a.email, a.created_at
    from public.applications a
    where a.company ilike '%' || v_like || '%' escape '\'
       or a.seq_no ilike '%' || v_like || '%' escape '\'
       or (char_length(v_digits) >= 3 and a.biz_no ilike '%' || v_digits || '%')
    order by a.created_at desc
    limit 20;
end;
$$;
revoke all on function public.search_applications_for_customer(text) from public;
grant execute on function public.search_applications_for_customer(text) to authenticated;

create or replace function public.get_company_request_history(p_company_id uuid)
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare
  v_biz text;
  v_source uuid;
begin
  if not public.has_permission((select auth.uid()), 'customers.manage') then
    raise exception 'permission denied: customers.manage required' using errcode = '42501';
  end if;
  select nullif(regexp_replace(coalesce(biz_no, ''), '\D', '', 'g'), ''), source_application_id
    into v_biz, v_source from public.companies where id = p_company_id;
  return jsonb_build_object(
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'seq_no', a.seq_no, 'company', a.company, 'status', a.status, 'created_at', a.created_at) order by a.created_at desc)
      from public.applications a
      where (v_biz is not null and regexp_replace(coalesce(a.biz_no, ''), '\D', '', 'g') = v_biz)
         or (v_source is not null and a.id = v_source)
    ), '[]'::jsonb),
    'service_requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'seq_no', s.seq_no, 'status', s.status, 'company_equipment_id', s.company_equipment_id, 'created_at', s.created_at) order by s.created_at desc)
      from public.service_requests s where s.company_id = p_company_id
    ), '[]'::jsonb),
    'supply_requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', sr.id, 'seq_no', sr.seq_no, 'status', sr.status, 'created_at', sr.created_at,
        'item_count', (select count(*)::int from public.supply_request_items i where i.request_id = sr.id),
        'items', coalesce((select jsonb_agg(jsonb_build_object('consumable_name_snapshot', i.consumable_name_snapshot, 'qty', i.qty) order by i.created_at) from public.supply_request_items i where i.request_id = sr.id), '[]'::jsonb)
      ) order by sr.created_at desc)
      from public.supply_requests sr where sr.company_id = p_company_id
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_company_request_history(uuid) from public;
grant execute on function public.get_company_request_history(uuid) to authenticated;
