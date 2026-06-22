-- 롤백: 사용자 하드 삭제 FK 변경 되돌리기.
-- 감사기록 FK를 다시 기본(NO ACTION)으로, demo_reservations.created_by는 NOT NULL 복원.
-- ⚠️ created_by에 NULL이 이미 존재하면(삭제 발생 후) NOT NULL 복원이 실패한다 → 먼저 정리 필요.

alter table public.demo_reservations drop constraint if exists demo_reservations_created_by_fkey;
alter table public.demo_reservations
  add constraint demo_reservations_created_by_fkey
  foreign key (created_by) references public.profiles (id);
alter table public.demo_reservations alter column created_by set not null;

alter table public.release_orders drop constraint if exists release_orders_created_by_fkey;
alter table public.release_orders
  add constraint release_orders_created_by_fkey
  foreign key (created_by) references public.profiles (id);

alter table public.equipment_inventory drop constraint if exists equipment_inventory_updated_by_fkey;
alter table public.equipment_inventory
  add constraint equipment_inventory_updated_by_fkey
  foreign key (updated_by) references public.profiles (id);

alter table public.email_log drop constraint if exists email_log_from_user_id_fkey;
alter table public.email_log
  add constraint email_log_from_user_id_fkey
  foreign key (from_user_id) references public.profiles (id);
