-- 견적서 PDF 사양 선택 #3 — create RPC에 spec_selection 전달.
-- 기존 함수(인자 적은 시그니처)를 drop 후 재정의. _quote_insert도 인자 추가.

drop function if exists public.create_quote(uuid, jsonb, jsonb, text);
drop function if exists public.create_manual_quote(text, text, text, text, jsonb, jsonb, text);
drop function if exists public._quote_insert(uuid, jsonb, jsonb, text);

-- 내부 insert 헬퍼 — spec_selection 인자 추가(null이면 그대로 null 저장 = 폴백).
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

  -- spec_selection은 null(폴백) 또는 배열만 허용. 그 외(객체 등)는 거부.
  if p_spec_selection is not null and jsonb_typeof(p_spec_selection) is distinct from 'array' then
    raise exception 'spec_selection은 배열이어야 합니다';
  end if;

  -- 공급가 = 모든 줄(단가×수량) 합. 음수 단가(할인/제외) 그대로 반영.
  v_supply := (
    select coalesce(sum((e ->> 'unitPrice')::numeric * (e ->> 'quantity')::numeric), 0)
    from jsonb_array_elements(p_items) e
  ) + (
    select coalesce(sum((e ->> 'unitPrice')::numeric * (e ->> 'quantity')::numeric), 0)
    from jsonb_array_elements(p_options) e
  );
  v_tax := round(v_supply * 0.1); -- 원단위 반올림(numeric round = 0.5 반올림)

  select assignee_id into v_assignee from public.applications where id = p_application_id;

  -- quote_no/version은 placeholder — quotes_server_fields 트리거가 INSERT 시 서버 채번으로 덮어씀.
  insert into public.quotes (
    application_id, quote_no, version, items, options,
    supply_price, tax_price, total, status, assignee_id, spec_selection
  )
  values (
    p_application_id, 'PENDING', 1, p_items, p_options,
    v_supply, v_tax, v_supply + v_tax, p_status, coalesce(v_assignee, auth.uid()), p_spec_selection
  )
  returning * into v_row;

  return v_row;
end;
$$;
revoke all on function public._quote_insert(uuid, jsonb, jsonb, text, jsonb) from public, anon, authenticated;

-- create_quote — 기존 의뢰 위에 견적 생성. quotes.write 명시 체크(DEFINER가 RLS 우회하므로).
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

-- create_manual_quote — 영업 수기 경로. application(source='manual') + quote를 한 트랜잭션에 생성.
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
