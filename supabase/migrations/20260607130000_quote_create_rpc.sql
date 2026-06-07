-- E5 백엔드 #2 — 견적 생성 결선 RPC.
-- 서버가 금액의 최종 권위: items·옵션만 받아 공급가·세액·합계를 SQL에서 직접 계산(클라 금액 무시).
-- 계산식 = 슬라이스1 TS calculateQuote와 동일(Σ단가×수량, round(×0.1), 합). 교차검증 테스트로 일치 보장.

-- 1. applications.source — 'public'(공개폼) / 'manual'(영업 수기). 서버 통제값(트리거로 UPDATE 불변).
alter table public.applications
  add column source text not null default 'public' check (source in ('public', 'manual'));

-- 기존 서버필드 트리거에 source 불변 추가(create or replace로 갱신, 컬럼은 위에서 먼저 생성됨).
create or replace function public.applications_enforce_server_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.seq_no := public.next_application_seq_no();
    new.created_at := now();
  elsif tg_op = 'UPDATE' then
    new.seq_no := old.seq_no;
    new.created_at := old.created_at;
    new.source := old.source; -- source는 생성 시점 확정값(공개/수기), 이후 변조 불가
  end if;
  return new;
end;
$$;

-- 2. 줄 검증 헬퍼 — 각 줄 unitPrice 정수·quantity 정수 ≥ 1. 내부 전용(직접 호출 차단).
create or replace function public._quote_validate_lines(p_lines jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  e jsonb;
  up numeric;
  qty numeric;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception '줄 목록은 배열이어야 합니다';
  end if;
  for e in select * from jsonb_array_elements(p_lines) loop
    up := (e ->> 'unitPrice')::numeric; -- 캐스트 실패(비숫자)는 예외로 거부됨
    qty := (e ->> 'quantity')::numeric;
    if up is null or up <> trunc(up) then
      raise exception '단가는 정수(원)여야 합니다: %', e;
    end if;
    if qty is null or qty <> trunc(qty) or qty < 1 then
      raise exception '수량은 1 이상 정수여야 합니다: %', e;
    end if;
  end loop;
end;
$$;
revoke all on function public._quote_validate_lines(jsonb) from public, anon, authenticated;

-- 3. 내부 insert 헬퍼 — 금액 계산 + quotes INSERT(채번 트리거가 quote_no/version 부여).
-- 두 공개 RPC(create_quote / create_manual_quote)가 공유. 정의자 컨텍스트에서만 실행.
create or replace function public._quote_insert(
  p_application_id uuid,
  p_items jsonb,
  p_options jsonb,
  p_status text
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
    supply_price, tax_price, total, status, assignee_id
  )
  values (
    p_application_id, 'PENDING', 1, p_items, p_options,
    v_supply, v_tax, v_supply + v_tax, p_status, coalesce(v_assignee, auth.uid())
  )
  returning * into v_row;

  return v_row;
end;
$$;
revoke all on function public._quote_insert(uuid, jsonb, jsonb, text) from public, anon, authenticated;

-- 4. create_quote — 기존 의뢰 위에 견적 생성. quotes.write 명시 체크(DEFINER가 RLS 우회하므로).
create or replace function public.create_quote(
  p_application_id uuid,
  p_items jsonb,
  p_options jsonb,
  p_status text default 'draft'
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
  v_row := public._quote_insert(p_application_id, p_items, p_options, p_status);
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.create_quote(uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.create_quote(uuid, jsonb, jsonb, text) to authenticated;

-- 5. create_manual_quote — 영업 수기 경로. application(source='manual') + quote를 한 트랜잭션에 생성.
-- 링크를 안 보내고 영업이 그 자리서 직접 견적을 만드는 흐름. orphan application 없음.
create or replace function public.create_manual_quote(
  p_company text,
  p_ceo text,
  p_phone text,
  p_email text,
  p_items jsonb,
  p_options jsonb,
  p_status text default 'draft'
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

  v_row := public._quote_insert(v_app_id, p_items, p_options, p_status);

  return jsonb_build_object('application_id', v_app_id, 'quote', to_jsonb(v_row));
end;
$$;
revoke all on function public.create_manual_quote(text, text, text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.create_manual_quote(text, text, text, text, jsonb, jsonb, text) to authenticated;
