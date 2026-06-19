-- 수기 견적을 기존 고객(company_id)에 연결 + 고객 이력에 노출.
-- 1) create_manual_quote에 p_company_id(선택) 추가 → applications.company_id 저장.
--    인자 추가 = 새 시그니처라 기존 8-인자 함수를 drop 후 9-인자로 재생성(최신 20260619100200 본문 기준).
-- 2) get_company_request_history가 견적을 company_id로도 매칭(biz_no 없는 이관 고객도 수기견적 표시).

drop function if exists public.create_manual_quote(text, text, text, text, jsonb, jsonb, text, jsonb);

create or replace function public.create_manual_quote(
  p_company text,
  p_ceo text,
  p_phone text,
  p_email text,
  p_items jsonb,
  p_options jsonb,
  p_status text default 'draft',
  p_spec_selection jsonb default null,
  p_company_id uuid default null
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
  -- 연결 대상 고객이 주어지면 존재 검증(위조·삭제된 id 거부).
  if p_company_id is not null
     and not exists (select 1 from public.companies where id = p_company_id) then
    raise exception '존재하지 않는 고객입니다';
  end if;

  insert into public.applications (company, ceo, phone, email, source, status, assignee_id, company_id)
  values (
    v_company,
    nullif(btrim(coalesce(p_ceo, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_email, '')), ''),
    'manual', 'quoted', auth.uid(), p_company_id
  )
  returning id into v_app_id;

  v_row := public._quote_insert(v_app_id, p_items, p_options, p_status, p_spec_selection);

  return jsonb_build_object('application_id', v_app_id, 'quote', to_jsonb(v_row));
end;
$$;
revoke all on function public.create_manual_quote(text, text, text, text, jsonb, jsonb, text, jsonb, uuid) from public, anon;
grant execute on function public.create_manual_quote(text, text, text, text, jsonb, jsonb, text, jsonb, uuid) to authenticated;

-- 고객 이력 RPC: 견적(applications) 매칭에 company_id 추가(biz_no·source_application_id·company_id 합집합).
-- 20260604120000 정의 기준 — 권한 게이트·service/supply 절은 그대로, applications where절만 확장.
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
         or (a.company_id = p_company_id)
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
