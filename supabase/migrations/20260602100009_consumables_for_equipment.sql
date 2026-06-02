-- M2 P-C #21 — 해석 함수: 장비에 매칭되는 active 소모품 dedup 반환.
-- scope.equipment_id 직접 OR scope.category_id = 장비분류 OR scope.category_id = 장비분류의 부모(대분류 공통).
-- 2단계 한정이라 재귀 불필요. SECURITY DEFINER + search_path='' + STABLE.
create or replace function public.consumables_for_equipment(p_equipment_id uuid)
returns setof public.consumables
language sql
security definer
set search_path = ''
stable
as $$
  select distinct cn.*
  from public.consumables cn
  join public.consumable_scope cs on cs.consumable_id = cn.id
  join lateral (
    -- LATERAL 단일행 조인: 카테시안 곱 방지 + 의도 명시(미래 수정 안전)
    select category_id from public.equipment where id = p_equipment_id
  ) e on true
  where cn.status = 'active'
    and (
      -- (a) 직접 장비 매핑
      cs.equipment_id = p_equipment_id
      -- (b) 장비 소속 분류(소분류 or 단독 대분류) 매핑
      or cs.category_id = e.category_id
      -- (c) 장비 소속 분류의 부모(대분류) 매핑 — "프린터 공통" 같은 대분류 스코프가 하위 장비 전체에 적용됨
      or cs.category_id = (select ec.parent_id from public.equipment_category ec where ec.id = e.category_id)
    );
$$;

-- 참고: 이 함수 호출 자체는 authenticated면 충분(consumables.manage 불필요). 쓰기만 manage.
-- anon/PUBLIC 차단: Supabase는 EXECUTE를 자동으로 PUBLIC에 부여하므로 명시적으로 revoke 필요.
-- authenticated만 호출 가능 (P-E에서 anon 노출 여부 별도 결정).
revoke execute on function public.consumables_for_equipment(uuid) from public, anon;
grant execute on function public.consumables_for_equipment(uuid) to authenticated;
