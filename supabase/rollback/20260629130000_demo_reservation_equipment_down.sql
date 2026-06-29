-- 롤백: equipment_id 복원(첫 자식 행으로) 후 자식 테이블·트리거·assignee 제거.
alter table public.demo_reservations add column equipment_id uuid references public.equipment (id);
update public.demo_reservations r set equipment_id = (
  select e.equipment_id from public.demo_reservation_equipment e
  where e.reservation_id = r.id order by e.id limit 1);
alter table public.demo_reservations alter column equipment_id set not null;
alter table public.demo_reservations
  add constraint demo_reservations_no_overlap
    exclude using gist (time_range with &&) where (status <> 'canceled');
drop trigger if exists demo_reservations_sync_children_trg on public.demo_reservations;
drop function if exists public.demo_reservations_sync_children();
drop table if exists public.demo_reservation_equipment;
alter table public.demo_reservations drop column if exists assignee_id;
