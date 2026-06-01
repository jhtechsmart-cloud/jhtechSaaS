-- M2 P-B #20 — 견적요청→고객 멱등 upsert(A2·A3) + 가져오기 검색(A8). 둘 다 DEFINER, customers.manage 내부검증.

-- upsert: biz_no 있으면 biz_no로, 없으면 source_application_id로 dedupe. ON CONFLICT 금지(부분 UNIQUE arbiter 미작동)
-- → EXCEPTION 블록으로 race 처리(A2). 반환 {company_id, created}(A9 dedup 배너용).
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
      select id into v_company_id from public.companies where biz_no = v_biz;
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

-- 가져오기 검색: customers.manage 보유자는 applications.view_all 없이도 전체 신청 검색(A8).
-- biz_no 검색은 정규화 질의에 숫자가 3자 이상일 때만(빈 패턴 전체매칭 방지).
create or replace function public.search_applications_for_customer(p_query text)
returns table (id uuid, seq_no text, company text, biz_no text, ceo text, phone text, email text, created_at timestamptz)
language plpgsql security definer set search_path = '' stable as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
  v_digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
begin
  if not public.has_permission((select auth.uid()), 'customers.manage') then
    raise exception 'permission denied: customers.manage required' using errcode = '42501';
  end if;
  if char_length(v_q) < 2 then return; end if;
  return query
    select a.id, a.seq_no, a.company, a.biz_no, a.ceo, a.phone, a.email, a.created_at
    from public.applications a
    where a.company ilike '%' || v_q || '%'
       or a.seq_no ilike '%' || v_q || '%'
       or (char_length(v_digits) >= 3 and a.biz_no ilike '%' || v_digits || '%')
    order by a.created_at desc
    limit 20;
end;
$$;
revoke all on function public.search_applications_for_customer(text) from public;
grant execute on function public.search_applications_for_customer(text) to authenticated;
