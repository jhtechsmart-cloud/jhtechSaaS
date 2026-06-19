-- 롤백: equipment_inventory 테이블·트리거·함수 제거.
drop trigger if exists equipment_inventory_server_fields on public.equipment_inventory;
drop function if exists public.equipment_inventory_enforce_server_fields();
drop table if exists public.equipment_inventory;
