-- 롤백: equipment.is_demo 컬럼 제거.
alter table public.equipment
  drop column if exists is_demo;
