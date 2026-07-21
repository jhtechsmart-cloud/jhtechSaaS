-- AS 히스토리 Part 2(#243) — 미연결 보유장비 카운트 RPC
--
-- 왜: 장비 상세의 "미연결 보유장비 n건" 안내가 company_equipment를 직접 세면
-- RLS(담당자 스코프) 때문에 보는 계정마다 다른 숫자가 나온다(영업=본인 담당 고객 행만).
-- SECURITY DEFINER로 뷰어 무관 정확한 건수를 돌려준다. 반환은 count 하나뿐이라 노출 위험 없음.
-- 매칭 규칙은 match_catalog_equipment 1벌 재사용(정규식 복제 금지 — 세션27 확립).
-- 성능: company_equipment 미연결 행(현재 한 자리 수) × match 함수 1회 — 규모상 무해.
create or replace function public.count_unlinked_company_equipment(p_equipment_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
    from public.company_equipment ce
   where ce.equipment_id is null
     and public.match_catalog_equipment(coalesce(ce.label, '')) = p_equipment_id;
$$;

revoke all on function public.count_unlinked_company_equipment(uuid) from public, anon;
grant execute on function public.count_unlinked_company_equipment(uuid) to authenticated, service_role;

comment on function public.count_unlinked_company_equipment(uuid) is
  '#243 장비 상세 미연결 안내용. SECURITY DEFINER = 뷰어 무관 정확 건수(오정보 방지).';
