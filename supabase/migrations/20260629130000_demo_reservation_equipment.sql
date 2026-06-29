-- 데모예약 복수 장비 + 장비별 겹침. equipment_id(단수)를 자식 테이블로 이동.
-- 자식 EXCLUDE(equipment_id =, time_range &&) = 같은 장비 겹침만 차단(다른 장비 OK).
-- btree_gist는 demo_reservations 마이그(20260612150000)에서 이미 생성됨.

-- 1) 담당자(영업) 컬럼 — nullable(미지정 허용).
alter table public.demo_reservations
  add column assignee_id uuid references public.profiles (id);
comment on column public.demo_reservations.assignee_id is '데모 담당 영업(미지정 가능).';

-- 2) 자식 테이블 — 예약↔장비 N. time_range·status는 부모서 동기화
--    (EXCLUDE where 절이 자식 컬럼만 참조 가능해 비정규화).
create table public.demo_reservation_equipment (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.demo_reservations (id) on delete cascade,
  equipment_id   uuid not null references public.equipment (id),
  time_range     tstzrange not null,
  status         text not null,
  -- 같은 장비 + 겹치는 시간(취소 제외) 차단. 다른 장비면 허용.
  constraint dre_no_overlap
    exclude using gist (equipment_id with =, time_range with &&) where (status <> 'canceled'),
  -- 한 예약에 같은 장비 중복 금지.
  constraint dre_unique_eq unique (reservation_id, equipment_id)
);
create index dre_reservation_idx on public.demo_reservation_equipment (reservation_id);
create index dre_time_gist on public.demo_reservation_equipment using gist (time_range);

-- 3) 기존 데이터 이전 — 각 예약의 단수 equipment_id를 자식 1행으로.
insert into public.demo_reservation_equipment (reservation_id, equipment_id, time_range, status)
  select id, equipment_id, time_range, status from public.demo_reservations;

-- 4) 단수 컬럼 + 부모의 기존 시간 겹침 EXCLUDE 제거(겹침 차단이 자식 장비별로 이동).
--    부모는 이제 시간만 겹쳐도 OK — 같은 장비 겹침만 자식 EXCLUDE가 막는다.
alter table public.demo_reservations drop column equipment_id;
alter table public.demo_reservations drop constraint demo_reservations_no_overlap;

-- 5) 부모 status 변경 시 자식 동기화(취소=자식도 canceled). time_range는 현재 수정 기능 없어 status만.
create or replace function public.demo_reservations_sync_children()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    update public.demo_reservation_equipment
      set status = new.status
      where reservation_id = new.id;
  end if;
  return null; -- AFTER 트리거
end;
$$;
create trigger demo_reservations_sync_children_trg
  after update on public.demo_reservations
  for each row execute function public.demo_reservations_sync_children();

-- 6) RLS — 조회=전 직원, 쓰기/삭제는 RPC(SECURITY DEFINER)가 주 경로지만 정책도 부모와 일관.
alter table public.demo_reservation_equipment enable row level security;
create policy dre_select on public.demo_reservation_equipment
  for select to authenticated using (true);
create policy dre_insert on public.demo_reservation_equipment
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'demo_reservations.write')));
create policy dre_update on public.demo_reservation_equipment
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'demo_reservations.write')))
  with check ((select public.has_permission((select auth.uid()), 'demo_reservations.write')));
create policy dre_delete on public.demo_reservation_equipment
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'users.manage')));
