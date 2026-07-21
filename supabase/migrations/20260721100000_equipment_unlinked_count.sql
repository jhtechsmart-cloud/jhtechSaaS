-- AS 히스토리 Part 2(#243) — 미연결 보유장비 카운트 RPC
--
-- 왜: 장비 상세의 "미연결 보유장비 n건" 안내가 company_equipment를 직접 세면
-- RLS(담당자 스코프) 때문에 보는 계정마다 다른 숫자가 나온다(영업=본인 담당 고객 행만).
-- SECURITY DEFINER로 뷰어 무관 정확한 건수를 돌려준다.
-- 매칭 규칙은 match_catalog_equipment 1벌 재사용(정규식 복제 금지 — 세션27 확립).
-- 권한: RLS 우회 함수이므로 내부에서 상세 페이지 가드와 동일 키를 강제(직접 RPC 호출 차단).
-- 성능: company_equipment 미연결 행(현재 한 자리 수) × match 함수 1회 — 규모상 무해.
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

comment on function public.count_unlinked_company_equipment(uuid) is
  '#243 장비 상세 미연결 안내용. SECURITY DEFINER = 뷰어 무관 정확 건수(오정보 방지). 내부 권한 검사 포함.';
