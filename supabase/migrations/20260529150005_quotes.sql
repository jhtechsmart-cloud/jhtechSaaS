-- E1 Foundation #5 — quotes (견적) + RLS
-- E-3: 재발행 = 새 불변 버전 행. is_latest 토글 레이스 회피 → UNIQUE(application_id, version).
-- 버전 런타임 로직(MAX 도출)은 E5. 여기선 제약·스키마·RLS만.

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  quote_no text not null,
  version int not null default 1,
  items jsonb not null default '[]',
  options jsonb not null default '[]',
  supply_price numeric(14, 2) not null default 0,
  tax_price numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  pdf_url text,
  status text not null default 'draft' check (status in ('draft', 'issued')),
  assignee_id uuid references public.profiles (id),
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  unique (application_id, version)
);
create index on public.quotes (application_id);

alter table public.quotes enable row level security;

-- SELECT: 배정 본인 OR applications.view_all (applications와 동일 scope).
create policy quotes_select on public.quotes
  for select to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'applications.view_all'))
  );

create policy quotes_insert on public.quotes
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'quotes.write')));

create policy quotes_update on public.quotes
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'quotes.write')))
  with check ((select public.has_permission((select auth.uid()), 'quotes.write')));

create policy quotes_delete on public.quotes
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'users.manage')));
