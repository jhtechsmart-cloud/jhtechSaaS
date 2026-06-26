-- 견적 특기사항(notes) 편집 가능화.
-- 지금까지 특기사항은 워커에 하드코딩(부가세 별도·유효기간 1개월)이었으나,
-- 견적별로 편집 가능하도록 quotes.notes(jsonb 문자열 배열)에 저장한다.
--   - null = 구 견적(미저장) → 워커가 기본 2줄로 폴백.
--   - 배열 = 견적 작성/수정 시 저장된 특기사항(빈 배열 = 특기사항 없음).
-- create RPC 3종에 p_notes(선택) 추가. 인자 추가 = 새 시그니처라 기존 함수 drop 후 재생성
-- (각각 최신 정의 본문 기준: _quote_insert/create_quote=20260619100200, create_manual_quote=20260619140100).

alter table public.quotes
  add column notes jsonb;

comment on column public.quotes.notes is '견적서 특기사항(문자열 배열). null=구 견적(워커가 기본 2줄 폴백).';

-- 기존 시그니처 제거(인자 1개 추가된 새 함수로 대체).
drop function if exists public.create_quote(uuid, jsonb, jsonb, text, jsonb);
drop function if exists public.create_manual_quote(text, text, text, text, jsonb, jsonb, text, jsonb, uuid);
drop function if exists public._quote_insert(uuid, jsonb, jsonb, text, jsonb);

-- 내부 insert 헬퍼 — p_notes 인자 추가(null이면 그대로 null 저장 = 폴백).
create or replace function public._quote_insert(
  p_application_id uuid,
  p_items jsonb,
  p_options jsonb,
  p_status text,
  p_spec_selection jsonb,
  p_notes jsonb
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
  -- notes도 null(폴백) 또는 문자열 배열만 허용.
  if p_notes is not null then
    if jsonb_typeof(p_notes) is distinct from 'array' then
      raise exception 'notes는 배열이어야 합니다';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_notes) e where jsonb_typeof(e) is distinct from 'string'
    ) then
      raise exception 'notes의 각 줄은 문자열이어야 합니다';
    end if;
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
    supply_price, tax_price, total, status, assignee_id, spec_selection, notes
  )
  values (
    p_application_id, 'PENDING', 1, p_items, p_options,
    v_supply, v_tax, v_supply + v_tax, p_status, coalesce(v_assignee, auth.uid()), p_spec_selection, p_notes
  )
  returning * into v_row;

  -- 의뢰 상태 자동 전진(앞으로만). 발행=견적발송, draft=견적중. quote_sent/closed는 보존(다운그레이드·재오픈 안 함).
  -- ⚠️ 20260608120000에서 추가된 전이 로직 — 이 마이그가 _quote_insert를 재정의하므로 반드시 보존.
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
revoke all on function public._quote_insert(uuid, jsonb, jsonb, text, jsonb, jsonb) from public, anon, authenticated;

-- create_quote — 기존 의뢰 위에 견적 생성. quotes.write 명시 체크(DEFINER가 RLS 우회하므로).
create or replace function public.create_quote(
  p_application_id uuid,
  p_items jsonb,
  p_options jsonb,
  p_status text default 'draft',
  p_spec_selection jsonb default null,
  p_notes jsonb default null
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
  v_row := public._quote_insert(p_application_id, p_items, p_options, p_status, p_spec_selection, p_notes);
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.create_quote(uuid, jsonb, jsonb, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_quote(uuid, jsonb, jsonb, text, jsonb, jsonb) to authenticated;

-- create_manual_quote — 영업 수기 경로. application(source='manual') + quote를 한 트랜잭션에 생성.
-- (20260619140100 본문 기준 — company_id 스코프 검증 보존 + p_notes 추가.)
create or replace function public.create_manual_quote(
  p_company text,
  p_ceo text,
  p_phone text,
  p_email text,
  p_items jsonb,
  p_options jsonb,
  p_status text default 'draft',
  p_spec_selection jsonb default null,
  p_company_id uuid default null,
  p_notes jsonb default null
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
  -- 연결 대상 고객이 주어지면 존재 + 담당 스코프 검증.
  -- ⚠️ DEFINER라 RLS 우회 → 존재만 보면 IDOR. 본인 담당 OR customers.view_all만 허용.
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

  v_row := public._quote_insert(v_app_id, p_items, p_options, p_status, p_spec_selection, p_notes);

  return jsonb_build_object('application_id', v_app_id, 'quote', to_jsonb(v_row));
end;
$$;
revoke all on function public.create_manual_quote(text, text, text, text, jsonb, jsonb, text, jsonb, uuid, jsonb) from public, anon;
grant execute on function public.create_manual_quote(text, text, text, text, jsonb, jsonb, text, jsonb, uuid, jsonb) to authenticated;
