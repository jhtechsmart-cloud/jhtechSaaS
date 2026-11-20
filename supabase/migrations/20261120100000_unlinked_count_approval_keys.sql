-- 미연결 보유장비 카운트 RPC — 승인·완료 권한 키 추가(구현현황비고 #42).
--
-- 왜: 장비 상세 페이지 가드(requireEquipmentDetailRead)는 #285에서 service_reports 5키
-- (write·view·view_all·approve·complete) ∪ equipment.manage로 넓어졌는데, 이 RPC는 #243 시점의
-- 4키 그대로라 승인·완료 권한만 가진 계정(이사·관리부)은 예외 → 0건으로 강등되어 안내 배너가 안 보였다.
-- 변경: 내부 권한 검사를 페이지 가드와 같은 6키로 맞춘다. 본문·시그니처·grant는 그대로.
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
  -- 상세 페이지 가드(service_reports 5키 ∪ equipment.manage)와 동일. users.manage는 has_permission이 자동 통과.
  if not (
    public.has_permission(v_uid, 'service_reports.write')
    or public.has_permission(v_uid, 'service_reports.view')
    or public.has_permission(v_uid, 'service_reports.view_all')
    or public.has_permission(v_uid, 'service_reports.approve')
    or public.has_permission(v_uid, 'service_reports.complete')
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
