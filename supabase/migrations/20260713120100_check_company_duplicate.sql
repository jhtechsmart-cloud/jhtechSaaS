-- 고객 등록/수정 시 중복 조회 RPC. RLS를 우회(SECURITY DEFINER)해 다른 영업 담당 고객과의
-- 중복까지 검사한다. 최소 필드만 반환. 우선순위: ① 사업자번호 정확일치 ② 회사명(공백제거·소문자)+전화(숫자) 동시일치.
-- 회사명 정규화 규칙은 web `normalizeCompanyName`(apps/web/src/lib/customers/validation.ts)과 일치시켜야 한다.
-- JS `\s`는 전각공백(U+3000, 엑셀 붙여넣기에 흔함)까지 공백으로 취급하므로, SQL도 [[:space:]]에
-- 전각공백 리터럴을 추가해 동일 집합을 제거한다(Postgres `\s`가 브래킷 안에서 전각공백까지 포함한다는
-- 보장이 없어 `[:space:]`(ASCII 공백류, 표준 POSIX 클래스) + 전각공백을 명시적으로 병기).
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
  -- ① 사업자번호 정확 일치(10자리일 때만)
  if v_biz ~ '^\d{10}$' then
    select * into v_row from public.companies
      where biz_no = v_biz and (p_exclude_id is null or id <> p_exclude_id)
      limit 1;
    if found then
      return jsonb_build_object('company_id', v_row.id, 'name', v_row.name, 'ceo', v_row.ceo, 'match', 'biz_no');
    end if;
  end if;
  -- ② 회사명 + 전화 동시 일치(사업자번호 없는 중복 방지)
  if v_name <> '' and v_phone <> '' then
    select * into v_row from public.companies
      where lower(regexp_replace(coalesce(name, ''), '[[:space:]　]', '', 'g')) = v_name
        and (
          regexp_replace(coalesce(mobile, ''), '\D', '', 'g') = v_phone or
          regexp_replace(coalesce(phone1, ''), '\D', '', 'g') = v_phone or
          regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_phone
        )
        and (p_exclude_id is null or id <> p_exclude_id)
      limit 1;
    if found then
      return jsonb_build_object('company_id', v_row.id, 'name', v_row.name, 'ceo', v_row.ceo, 'match', 'name_phone');
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.check_company_duplicate(text, text, text, uuid) from public, anon;
grant execute on function public.check_company_duplicate(text, text, text, uuid) to authenticated;
