-- 롤백: 재고현황 판매확정 확장 되돌림.
drop function if exists public.cancel_equipment_sale(uuid);
drop function if exists public.confirm_equipment_sale(uuid);
drop table if exists public.inventory_sale_log;

-- 트리거 함수 원복(스킵 플래그 제거).
create or replace function public.equipment_inventory_enforce_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

alter table public.equipment_inventory
  drop column if exists sold_confirmed,
  drop column if exists demo_qty,
  drop column if exists used_qty;
