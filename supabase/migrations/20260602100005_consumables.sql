-- M2 P-C #21 — consumables(소모품 마스터). 컬러·품목 단위 1행.
-- 쓰기=consumables.manage(admin은 users.manage 자동), 읽기=authenticated 전원.
-- 서버통제값(created_at·updated_at)은 트리거 불변(P-B company_equipment 패턴).
create table public.consumables (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text,
  sku text,
  price numeric(14, 2),
  note text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consumables_name_len check (char_length(name) <= 200),
  constraint consumables_unit_len check (unit is null or char_length(unit) <= 50),
  constraint consumables_sku_len check (sku is null or char_length(sku) <= 100),
  constraint consumables_note_len check (note is null or char_length(note) <= 2000)
);
create index consumables_status_idx on public.consumables (status);

create or replace function public.consumables_enforce_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.created_at := now(); new.updated_at := now();
  elsif tg_op = 'UPDATE' then new.created_at := old.created_at; new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger consumables_server_fields
  before insert or update on public.consumables
  for each row execute function public.consumables_enforce_server_fields();

alter table public.consumables enable row level security;
create policy consumables_select on public.consumables
  for select to authenticated using (true);
create policy consumables_insert on public.consumables
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'consumables.manage')));
create policy consumables_update on public.consumables
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'consumables.manage')))
  with check ((select public.has_permission((select auth.uid()), 'consumables.manage')));
create policy consumables_delete on public.consumables
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'consumables.manage')));
