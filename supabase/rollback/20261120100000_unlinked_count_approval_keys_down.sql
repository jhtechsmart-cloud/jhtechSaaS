-- 20261120100000_unlinked_count_approval_keys 되돌리기 — count_unlinked_company_equipment를 #243 원본(4키)으로 복원.
create or replace function public.count_unlinked_company_equipment(p_equipment_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_n integer;
begin
  -- 상세 페이지 가드(read 3키 ∪ equipment.manage)와 동일. users.manage는 has_permission이 자동 통과.
  if not (
    public.has_permission(v_uid, 'service_reports.write')
    or public.has_permission(v_uid, 'service_reports.view')
    or public.has_permission(v_uid, 'service_reports.view_all')
    or public.has_permission(v_uid, 'equipment.manage')
  ) then
    raise exception '미연결 보유장비 조회 권한이 없습니다' using errcode = '42501';
  end if;

  select count(*)::int into v_n
    from public.company_equipment ce
   where ce.equipment_id is null
     and public.match_catalog_equipment(coalesce(ce.label, '')) = p_equipment_id;
  return v_n;
end;
$$;
revoke all on function public.count_unlinked_company_equipment(uuid) from public, anon;
grant execute on function public.count_unlinked_company_equipment(uuid) to authenticated, service_role;
