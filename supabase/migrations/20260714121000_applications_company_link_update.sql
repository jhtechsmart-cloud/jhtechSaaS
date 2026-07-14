-- applications.company_id 의미 변경: '생성 시점 확정(불변)' → '연결된 고객(가변 링크)'.
-- 견적요청 상세에서 기존 고객과 수동 연결·재연결할 수 있어야 한다(관리자 매칭·교정 기능).
-- 보호는 RLS applications_update(자기 배정 건 또는 applications.assign)가 담당하고,
-- 고객 측 스코프(남의 담당 고객 연결 방지)는 서버 액션에서 검증한다.
-- seq_no·created_at·source 동결은 기존 그대로 유지.
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
    -- company_id 동결 해제(20260619140000의 `new.company_id := old.company_id` 제거).
  end if;
  return new;
end;
$$;

-- 고객 등록(upsert) 시 해당 의뢰에도 연결을 기록 — 등록/기존조회 양쪽 모두 company_id 세팅.
-- 본문은 20260604120000(customers.edit 게이트) 기준 + return 직전 applications 링크 한 줄 추가.
create or replace function public.upsert_company_from_application(p_application_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_app public.applications%rowtype;
  v_biz text;
  v_company_id uuid;
  v_created boolean := false;
begin
  if not public.has_permission((select auth.uid()), 'customers.edit') then
    raise exception 'permission denied: customers.edit required' using errcode = '42501';
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

  -- 의뢰에 연결 기록(신규 등록·기존 고객 매칭 양쪽) — 이후 상세/이력이 링크 기준으로 동작.
  update public.applications set company_id = v_company_id
    where id = p_application_id and company_id is distinct from v_company_id;

  return jsonb_build_object('company_id', v_company_id, 'created', v_created);
end;
$$;
revoke all on function public.upsert_company_from_application(uuid) from public;
grant execute on function public.upsert_company_from_application(uuid) to authenticated;
