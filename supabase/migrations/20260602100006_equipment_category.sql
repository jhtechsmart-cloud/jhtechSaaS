-- M2 — equipment_category(장비 분류 2단계). 대분류(parent_id null)/소분류(parent_id 있음).
-- 손자 금지(2단계 강제) 트리거. 쓰기=equipment.manage, 읽기=authenticated.
create table public.equipment_category (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.equipment_category (id) on delete restrict,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_category_name_len check (char_length(name) <= 100)
);
create unique index equipment_category_uniq_top on public.equipment_category (name) where parent_id is null;
create unique index equipment_category_uniq_child on public.equipment_category (parent_id, name) where parent_id is not null;
create index equipment_category_parent_idx on public.equipment_category (parent_id);
create index equipment_category_sort_idx on public.equipment_category (sort_order);

create or replace function public.equipment_category_enforce()
returns trigger language plpgsql set search_path = '' as $$
declare parent_parent uuid;
begin
  if tg_op = 'INSERT' then new.created_at := now(); new.updated_at := now();
  elsif tg_op = 'UPDATE' then new.created_at := old.created_at; new.updated_at := now();
  end if;
  if new.parent_id is not null then
    if new.parent_id = new.id then raise exception '자기 자신을 부모로 지정할 수 없습니다'; end if;
    select ec.parent_id into parent_parent from public.equipment_category ec where ec.id = new.parent_id;
    if parent_parent is not null then
      raise exception '분류는 2단계까지만 허용됩니다(손자 금지)';
    end if;
  end if;
  return new;
end;
$$;
create trigger equipment_category_enforce_trg
  before insert or update on public.equipment_category
  for each row execute function public.equipment_category_enforce();

alter table public.equipment_category enable row level security;
create policy equipment_category_select on public.equipment_category
  for select to authenticated using (true);
create policy equipment_category_insert on public.equipment_category
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'equipment.manage')));
create policy equipment_category_update on public.equipment_category
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'equipment.manage')))
  with check ((select public.has_permission((select auth.uid()), 'equipment.manage')));
create policy equipment_category_delete on public.equipment_category
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'equipment.manage')));
