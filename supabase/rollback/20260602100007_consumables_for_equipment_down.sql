-- 롤백: consumables_for_equipment 해석 함수 제거 (M2 P-C #21)
drop function if exists public.consumables_for_equipment(uuid);
