-- M2 P-B #20 — company_equipment(보유장비). equipment_id(카탈로그) XOR label(자유입력)=정확히 하나(A6).
-- company 삭제 시 cascade. id는 향후 P-D/P-E/P-F FK 참조 → admin 저장은 diff-upsert로 id 보존(actions, A1).
create table public.company_equipment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  equipment_id uuid references public.equipment (id),
  label text,
  serial_no text,
  purchased_at date,
  install_address text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_equipment_identity
    check ((equipment_id is not null) <> (nullif(btrim(label), '') is not null))
);
create index company_equipment_company_idx on public.company_equipment (company_id);
create index company_equipment_equipment_idx on public.company_equipment (equipment_id);

create or replace function public.company_equipment_enforce_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.created_at := now(); new.updated_at := now();
  elsif tg_op = 'UPDATE' then new.created_at := old.created_at; new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger company_equipment_server_fields
  before insert or update on public.company_equipment
  for each row execute function public.company_equipment_enforce_server_fields();

alter table public.company_equipment enable row level security;
create policy company_equipment_select on public.company_equipment
  for select to authenticated using (true);
create policy company_equipment_insert on public.company_equipment
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'customers.manage')));
create policy company_equipment_update on public.company_equipment
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'customers.manage')))
  with check ((select public.has_permission((select auth.uid()), 'customers.manage')));
create policy company_equipment_delete on public.company_equipment
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'customers.manage')));
