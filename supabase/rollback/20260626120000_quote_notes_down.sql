-- 롤백: 20260626120000_quote_notes
-- p_notes 인자 추가분을 되돌린다 — 새 6-인자 함수 drop 후 이전 시그니처(spec_selection까지) 복원,
-- quotes.notes 컬럼 제거. 복원 본문 = 20260619100200(_quote_insert/create_quote) + 20260619140100(create_manual_quote).

drop function if exists public.create_quote(uuid, jsonb, jsonb, text, jsonb, jsonb);
drop function if exists public.create_manual_quote(text, text, text, text, jsonb, jsonb, text, jsonb, uuid, jsonb);
drop function if exists public._quote_insert(uuid, jsonb, jsonb, text, jsonb, jsonb);

create or replace function public._quote_insert(
  p_application_id uuid,
  p_items jsonb,
  p_options jsonb,
  p_status text,
  p_spec_selection jsonb
)
returns public.quotes
language plpgsql
set search_path = ''
as $$
declare
  v_supply numeric(14, 2);
  v_tax numeric(14, 2);
  v_assignee uuid;
  v_row public.quotes;
begin
  perform public._quote_validate_lines(p_items);
  perform public._quote_validate_lines(p_options);

  if p_spec_selection is not null and jsonb_typeof(p_spec_selection) is distinct from 'array' then
    raise exception 'spec_selection은 배열이어야 합니다';
  end if;

  v_supply := (
    select coalesce(sum((e ->> 'unitPrice')::numeric * (e ->> 'quantity')::numeric), 0)
    from jsonb_array_elements(p_items) e
  ) + (
    select coalesce(sum((e ->> 'unitPrice')::numeric * (e ->> 'quantity')::numeric), 0)
    from jsonb_array_elements(p_options) e
  );
  v_tax := round(v_supply * 0.1);

  select assignee_id into v_assignee from public.applications where id = p_application_id;

  insert into public.quotes (
    application_id, quote_no, version, items, options,
    supply_price, tax_price, total, status, assignee_id, spec_selection
  )
  values (
    p_application_id, 'PENDING', 1, p_items, p_options,
    v_supply, v_tax, v_supply + v_tax, p_status, coalesce(v_assignee, auth.uid()), p_spec_selection
  )
  returning * into v_row;

  if p_status = 'issued' then
    update public.applications set status = 'quote_sent'
    where id = p_application_id and status in ('new', 'assigned', 'quoted');
  else
    update public.applications set status = 'quoted'
    where id = p_application_id and status in ('new', 'assigned');
  end if;

  return v_row;
end;
$$;
revoke all on function public._quote_insert(uuid, jsonb, jsonb, text, jsonb) from public, anon, authenticated;

create or replace function public.create_quote(
  p_application_id uuid,
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
  v_row public.quotes;
begin
  if not public.has_permission(auth.uid(), 'quotes.write') then
    raise exception '견적 작성 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.applications where id = p_application_id) then
    raise exception '존재하지 않는 의뢰입니다: %', p_application_id;
  end if;
  v_row := public._quote_insert(p_application_id, p_items, p_options, p_status, p_spec_selection);
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.create_quote(uuid, jsonb, jsonb, text, jsonb) from public, anon;
grant execute on function public.create_quote(uuid, jsonb, jsonb, text, jsonb) to authenticated;

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
  if p_company_id is not null
     and not exists (
       select 1 from public.companies c
       where c.id = p_company_id
         and (c.assignee_id = auth.uid() or public.has_permission(auth.uid(), 'customers.view_all'))
     ) then
    raise exception '존재하지 않거나 접근 권한이 없는 고객입니다' using errcode = 'insufficient_privilege';
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

alter table public.quotes drop column if exists notes;
