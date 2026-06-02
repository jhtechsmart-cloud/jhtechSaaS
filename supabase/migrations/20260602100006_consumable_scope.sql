-- M2 P-C #21 — consumable_scope(매핑). category XOR equipment_id = 정확히 하나(C2).
-- "모든 프린터" = category 2행. consumable·equipment 삭제 시 cascade.
-- id는 P-E item·이력 FK 대비 보존 → admin 저장은 diff-upsert(replace 금지).
create table public.consumable_scope (
  id uuid primary key default gen_random_uuid(),
  consumable_id uuid not null references public.consumables (id) on delete cascade,
  category text,
  equipment_id uuid references public.equipment (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consumable_scope_identity
    check ((category is not null) <> (equipment_id is not null)),
  constraint consumable_scope_category_len
    check (category is null or char_length(category) <= 100)
);
-- 부분 UNIQUE: 같은 소모품에 같은 분류/장비 중복 매핑 방지.
-- ⚠️ 부분 UNIQUE는 ON CONFLICT arbiter 미작동(42P10) — 저장은 id 보존 diff-upsert라 무관(무결성 가드 전용).
create unique index consumable_scope_uniq_equipment
  on public.consumable_scope (consumable_id, equipment_id) where equipment_id is not null;
create unique index consumable_scope_uniq_category
  on public.consumable_scope (consumable_id, category) where category is not null;
create index consumable_scope_consumable_idx on public.consumable_scope (consumable_id);
create index consumable_scope_equipment_idx on public.consumable_scope (equipment_id);
create index consumable_scope_category_idx on public.consumable_scope (category);

create or replace function public.consumable_scope_enforce_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.created_at := now(); new.updated_at := now();
  elsif tg_op = 'UPDATE' then new.created_at := old.created_at; new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger consumable_scope_server_fields
  before insert or update on public.consumable_scope
  for each row execute function public.consumable_scope_enforce_server_fields();

alter table public.consumable_scope enable row level security;
create policy consumable_scope_select on public.consumable_scope
  for select to authenticated using (true);
create policy consumable_scope_insert on public.consumable_scope
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'consumables.manage')));
create policy consumable_scope_update on public.consumable_scope
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'consumables.manage')))
  with check ((select public.has_permission((select auth.uid()), 'consumables.manage')));
create policy consumable_scope_delete on public.consumable_scope
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'consumables.manage')));
