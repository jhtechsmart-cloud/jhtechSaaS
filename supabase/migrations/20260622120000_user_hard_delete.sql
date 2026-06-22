-- 사용자 하드 삭제 지원 (#168 후속) — 잘못 만든/중복 계정을 안전하게 완전 삭제.
-- 단일 출처 결정(2026-06-22):
--   · 담당자(assignee_id) FK 5종은 그대로 NO ACTION 유지 → 담당 건이 하나라도 있으면
--     auth.users 삭제 시 profiles CASCADE가 막혀 DB 레벨에서 삭제 거부(= 재배정 강제 안전망).
--   · 감사기록(작성자·수정자·메일발송자) FK 4종은 ON DELETE SET NULL → 이력은 보존하고
--     '작성자' 참조만 비운다(계정 삭제가 영구 차단되지 않도록).
-- 삭제 흐름: auth.users 1행 삭제 → profiles(id) on delete cascade → 아래 SET NULL FK 자동 정리.

-- 1) demo_reservations.created_by — NOT NULL 해제 후 SET NULL.
--    (작성자를 비울 수 있어야 하므로 nullable로 전환. 표시는 비정규화된 customer_name 등으로 유지.)
alter table public.demo_reservations alter column created_by drop not null;
alter table public.demo_reservations drop constraint if exists demo_reservations_created_by_fkey;
alter table public.demo_reservations
  add constraint demo_reservations_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

-- 2) release_orders.created_by (이미 nullable).
alter table public.release_orders drop constraint if exists release_orders_created_by_fkey;
alter table public.release_orders
  add constraint release_orders_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

-- 3) equipment_inventory.updated_by (이미 nullable).
alter table public.equipment_inventory drop constraint if exists equipment_inventory_updated_by_fkey;
alter table public.equipment_inventory
  add constraint equipment_inventory_updated_by_fkey
  foreign key (updated_by) references public.profiles (id) on delete set null;

-- 4) email_log.from_user_id (이미 nullable).
alter table public.email_log drop constraint if exists email_log_from_user_id_fkey;
alter table public.email_log
  add constraint email_log_from_user_id_fkey
  foreign key (from_user_id) references public.profiles (id) on delete set null;

-- ── 서버필드 트리거 보정 ────────────────────────────────────────────────
-- FK ON DELETE SET NULL은 내부적으로 UPDATE를 일으킨다. 작성자를 동결하던 BEFORE UPDATE
-- 트리거가 NULL을 옛값으로 되돌리면(또는 예외) 계정 삭제가 막힌다 → "NULL로의 전환만" 허용.
-- 클라가 다른 값으로 바꾸려는 시도(non-null 변경)는 기존대로 차단(보호 유지).
--
-- equipment_inventory: updated_by := auth.uid() (삭제는 service_role 경로라 auth.uid()=NULL → 보정 불필요).
-- email_log: from_user_id 동결 UPDATE 트리거 없음 → 보정 불필요.

-- demo_reservations: UPDATE 시 created_by를 무조건 old로 되돌리던 것을 'non-null일 때만'으로.
create or replace function public.demo_reservations_enforce_server_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    -- 클라가 보낸 created_by는 무시하고 호출자 본인으로. service_role(auth.uid() NULL)은 지정값 유지.
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_at := old.created_at;
    -- 작성자 변경 차단(기존 보호). 단 FK SET NULL(계정 삭제)이 NULL로 만드는 건 허용.
    if new.created_by is not null then
      new.created_by := old.created_by;
    end if;
  end if;
  return new;
end;
$$;

-- release_orders: 발행본 동결 가드에서 created_by가 NULL이 되는 경우(계정 삭제)는 예외에서 제외.
create or replace function public.release_orders_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.seq_no := old.seq_no;
  new.created_at := old.created_at;
  if old.status = 'issued' then
    if new.application_id is distinct from old.application_id
       or new.quote_id is distinct from old.quote_id
       or new.device_kind is distinct from old.device_kind
       or new.status is distinct from old.status
       or new.company is distinct from old.company
       or new.contact_phone is distinct from old.contact_phone
       or new.install_address is distinct from old.install_address
       or new.install_at is distinct from old.install_at
       or new.device_name is distinct from old.device_name
       or new.details is distinct from old.details
       or (new.created_by is not null and new.created_by is distinct from old.created_by) then
      raise exception '발행된 출고의뢰서는 수정할 수 없습니다(pdf_url만 갱신 가능)';
    end if;
  end if;
  return new;
end; $$;
