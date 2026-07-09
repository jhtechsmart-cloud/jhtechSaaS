-- 롤백: 장비옵션 sort_order 컬럼·인덱스 제거.
drop index if exists public.equipment_option_sort_idx;
alter table public.equipment_option drop column if exists sort_order;
