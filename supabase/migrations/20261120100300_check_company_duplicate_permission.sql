-- 고객 중복 조회 RPC에 내부 권한 검사 추가(구현현황비고 #85).
--
-- 왜: SECURITY DEFINER(RLS 우회)로 전체 companies를 조회해 회사명·대표자·사업자번호·담당자·주소를 돌려주는데
-- 함수 안 권한 검사가 없어, 로그인한 직원이면 누구나(현장 기사 등) 직접 RPC 호출로 고객 정보를 조회할 수 있었다.
-- 변경: 호출 경로(lib/customers/actions.ts — checkCustomerDuplicate·createCustomer·updateCustomer)의 가드와 같은
-- customers.edit를 함수 안에서도 강제한다(users.manage는 has_permission이 자동 통과). 조회 규칙은 20260714120000 그대로.
create or replace function public.check_company_duplicate(
  p_biz_no text, p_name text, p_phone text, p_exclude_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' stable as $$
declare
  v_biz text := regexp_replace(coalesce(p_biz_no, ''), '\D', '', 'g');
  v_name text := lower(regexp_replace(coalesce(p_name, ''), '[[:space:]　]', '', 'g'));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_row public.companies%rowtype;
begin
  if not public.has_permission((select auth.uid()), 'customers.edit') then
    raise exception 'permission denied: customers.edit required' using errcode = '42501';
  end if;
  -- ① 사업자번호 정확 일치(10자리일 때만) — 불변
  if v_biz ~ '^\d{10}$' then
    select * into v_row from public.companies
      where biz_no = v_biz and (p_exclude_id is null or id <> p_exclude_id)
      limit 1;
    if found then
      return jsonb_build_object('company_id', v_row.id, 'name', v_row.name, 'ceo', v_row.ceo, 'match', 'biz_no');
    end if;
  end if;
  -- ② 회사명 + 전화 동시 일치(사업자번호 없는 중복 방지) — 불변
  if v_name <> '' and v_phone <> '' then
    select * into v_row from public.companies
      where lower(regexp_replace(coalesce(name, ''), '[[:space:]　]', '', 'g')) = v_name
        and (
          regexp_replace(coalesce(mobile, ''), '\D', '', 'g') = v_phone or
          regexp_replace(coalesce(phone1, ''), '\D', '', 'g') = v_phone or
          regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_phone
        )
        and (p_exclude_id is null or id <> p_exclude_id)
      order by id
      limit 1;
    if found then
      return jsonb_build_object('company_id', v_row.id, 'name', v_row.name, 'ceo', v_row.ceo, 'match', 'name_phone');
    end if;
  end if;
  -- ③ 회사명 단독 일치 — 저장 차단이 아닌 확인 게이트용
  if v_name <> '' then
    select * into v_row from public.companies
      where lower(regexp_replace(coalesce(name, ''), '[[:space:]　]', '', 'g')) = v_name
        and (p_exclude_id is null or id <> p_exclude_id)
      order by id
      limit 1;
    if found then
      return jsonb_build_object(
        'company_id', v_row.id, 'name', v_row.name, 'ceo', v_row.ceo, 'match', 'name_only',
        'biz_no', v_row.biz_no, 'manager', v_row.manager, 'address', v_row.address);
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.check_company_duplicate(text, text, text, uuid) from public, anon;
grant execute on function public.check_company_duplicate(text, text, text, uuid) to authenticated;
