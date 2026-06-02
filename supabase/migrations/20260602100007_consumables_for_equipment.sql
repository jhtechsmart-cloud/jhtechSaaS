-- M2 P-C #21 — 해석 함수: 주어진 장비에 매칭되는 active 소모품을 dedup 반환.
-- scope.equipment_id = 장비 직접 매핑 OR scope.category = 장비의 category 분류 매핑.
-- P-C admin 소모품 미리보기 + P-E 견적 소모품 선택에서 재사용.
-- SECURITY DEFINER + search_path='' (E1 표준). 읽기 전용이라 STABLE.
create or replace function public.consumables_for_equipment(p_equipment_id uuid)
returns setof public.consumables
language sql
security definer
set search_path = ''
stable
as $$
  -- distinct: 분류·장비 양쪽에 동시 매핑된 소모품이 중복 없이 1행으로 반환되도록 보장.
  select distinct cn.*
  from public.consumables cn
  join public.consumable_scope cs on cs.consumable_id = cn.id
  where cn.status = 'active'
    and (
      -- 장비 직접 매핑
      cs.equipment_id = p_equipment_id
      -- 또는 장비의 분류와 일치하는 분류 매핑
      or cs.category = (select e.category from public.equipment e where e.id = p_equipment_id)
    );
$$;

-- authenticated 역할에 실행 권한 부여(읽기).
-- anon(공개) 노출은 P-E에서 별도 RPC로 결정 — 여기선 미부여.
grant execute on function public.consumables_for_equipment(uuid) to authenticated;
