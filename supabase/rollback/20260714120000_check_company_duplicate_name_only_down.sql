-- 20260714120000 롤백 — check_company_duplicate를 20260713120100 정의(2순위까지)로 복원.
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
      order by id
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
