-- 장비 재고현황(#4) — 장비 1:1 재고 테이블. 관리자(equipment.manage)가 수기로 관리.
-- 미래 창고 재고 연동·이력 확장 시 카탈로그(equipment) 테이블을 안 건드리도록 별도 테이블.
create table public.equipment_inventory (
  equipment_id uuid primary key references public.equipment(id) on delete cascade,
  stock_qty    int  not null default 0 check (stock_qty >= 0), -- 재고 수량
  restock_date date,                                           -- 입고예정일(품절 안내용), nullable
  note         text,                                           -- 메모
  updated_at   timestamptz not null default now(),             -- 서버 통제(트리거)
  updated_by   uuid references public.profiles(id),            -- 수정자(서버 통제)
  constraint equipment_inventory_note_len check (note is null or char_length(note) <= 500)
);

-- 서버통제값: updated_at·updated_by는 클라 입력 무시하고 트리거가 강제(service_role도 우회 불가).
create or replace function public.equipment_inventory_enforce_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;
create trigger equipment_inventory_server_fields
  before insert or update on public.equipment_inventory
  for each row execute function public.equipment_inventory_enforce_server_fields();

alter table public.equipment_inventory enable row level security;

-- SELECT: authenticated 전원(equipment 테이블 SELECT 정책과 동일 범위).
create policy equipment_inventory_select on public.equipment_inventory
  for select to authenticated using (true);

-- INSERT/UPDATE/DELETE: equipment.manage. InitPlan 래핑((select ...))으로 행마다 재평가 회피.
create policy equipment_inventory_insert on public.equipment_inventory
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'equipment.manage')));
create policy equipment_inventory_update on public.equipment_inventory
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'equipment.manage')))
  with check ((select public.has_permission((select auth.uid()), 'equipment.manage')));
create policy equipment_inventory_delete on public.equipment_inventory
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'equipment.manage')));
