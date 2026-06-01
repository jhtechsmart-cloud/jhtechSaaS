-- M2 P-B #20 — companies(고객 마스터). 쓰기=customers.manage, 읽기=authenticated 전원.
-- biz_no nullable + 부분 UNIQUE(D2). source_application_id=자동생성 출처(불변·ON DELETE SET NULL).
-- created_at·source_application_id 서버 통제 → BEFORE 트리거 강제(applications 패턴 재사용, A4).

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  biz_no text,
  name text not null,
  ceo text,
  phone text,
  email text,
  address text,
  assignee_id uuid references public.profiles (id),
  source_application_id uuid references public.applications (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_biz_no_format check (biz_no is null or biz_no ~ '^\d{10}$'),
  constraint companies_name_len check (char_length(name) <= 200),
  constraint companies_address_len check (address is null or char_length(address) <= 500)
);
create unique index companies_biz_no_unique on public.companies (biz_no) where biz_no is not null;
create index companies_assignee_idx on public.companies (assignee_id);
create index companies_updated_idx on public.companies (updated_at desc);

create or replace function public.companies_enforce_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  elsif tg_op = 'UPDATE' then
    new.created_at := old.created_at;                       -- 불변
    new.source_application_id := old.source_application_id;  -- 출처 불변(감사)
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger companies_server_fields
  before insert or update on public.companies
  for each row execute function public.companies_enforce_server_fields();

alter table public.companies enable row level security;

create policy companies_select on public.companies
  for select to authenticated using (true);
create policy companies_insert on public.companies
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'customers.manage')));
create policy companies_update on public.companies
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'customers.manage')))
  with check ((select public.has_permission((select auth.uid()), 'customers.manage')));
create policy companies_delete on public.companies
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'customers.manage')));
