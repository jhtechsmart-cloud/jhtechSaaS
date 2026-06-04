-- 견적 담당자 배정 → 연결 고객의 담당영업(companies.assignee_id) 단방향 전파.
-- 버그: 견적 등록(고객생성)이 배정보다 먼저면 고객 담당영업이 null로 남고, 이후 견적 배정해도
-- 반영 안 됨(applications 배정 액션이 companies를 안 건드림 + upsert는 INSERT시점에만 복사).
-- 결정: 단방향(견적→고객), fill-if-empty(이미 정해진 담당영업·수동지정은 안 덮음).
-- 영업 claim 시 customers.edit가 없어 일반 클라 UPDATE가 RLS에 막히므로 DEFINER로 우회 + 권한 게이트 내장.

create or replace function public.sync_company_assignee_from_application(p_application_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_app public.applications%rowtype;
  v_biz text;
  v_company_id uuid;
begin
  -- 견적 배정/claim 직후 호출 → 호출자는 배정 또는 claim 권한 보유자만. (users.manage는 has_permission super 처리.)
  if not (public.has_permission((select auth.uid()), 'applications.assign')
       or public.has_permission((select auth.uid()), 'applications.claim')) then
    raise exception 'permission denied: applications.assign or applications.claim required'
      using errcode = '42501';
  end if;

  select * into v_app from public.applications where id = p_application_id;
  -- 배정 해제(null)·미배정이면 전파 안 함(단방향이라 고객 담당영업을 지우지 않는다).
  if not found or v_app.assignee_id is null then
    return null;
  end if;

  -- 연결 고객 찾기: biz_no 정규화 매칭 우선, 없으면 source_application_id(upsert RPC와 동일 규칙).
  v_biz := nullif(regexp_replace(coalesce(v_app.biz_no, ''), '\D', '', 'g'), '');
  if v_biz is not null then
    select id into v_company_id from public.companies where biz_no = v_biz;
  else
    select id into v_company_id from public.companies where source_application_id = p_application_id;
  end if;
  if v_company_id is null then
    return null; -- 아직 고객 미등록 → no-op
  end if;

  -- fill-if-empty: 담당영업이 비어있을 때만 채움. 이미 있으면(수동지정·앞선 배정) 그대로 둠.
  update public.companies
    set assignee_id = v_app.assignee_id
    where id = v_company_id and assignee_id is null;

  return v_company_id;
end;
$$;

-- authenticated 전용: grant만으론 anon/public 안 막힘 → revoke 명시(SECURITY DEFINER 노출 차단).
revoke all on function public.sync_company_assignee_from_application(uuid) from public;
revoke all on function public.sync_company_assignee_from_application(uuid) from anon;
grant execute on function public.sync_company_assignee_from_application(uuid) to authenticated;
