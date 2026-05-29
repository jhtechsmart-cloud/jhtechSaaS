-- E1 Foundation #4 — applications + 전역 seq 채번 + anon 공개폼 INSERT + assignee row scope
-- D2: 전역 Postgres sequence(레이스 0). E-4: row scope = assignee OR view_all. E-5: anon WITH CHECK.

create sequence public.application_seq;
grant usage on sequence public.application_seq to anon, authenticated;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  seq_no text unique not null default
    ('REQ-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.application_seq')::text, 5, '0')),
  company text not null,
  ceo text,
  biz_no text,
  phone text,
  email text,
  address text,
  status text not null default 'new' check (status in ('new', 'assigned', 'quoted', 'closed')),
  assignee_id uuid references public.profiles (id),
  fields jsonb not null default '{}',
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.applications (assignee_id);
create index on public.applications (status);
create index on public.applications (created_at desc);

alter table public.applications enable row level security;

-- E-5: 공개 폼 — anon은 INSERT만, status='new' + 미배정 강제. SELECT 금지.
create policy applications_insert_anon on public.applications
  for insert to anon
  with check (status = 'new' and assignee_id is null);

-- E-4: 로그인 사용자는 자기 배정 건 OR applications.view_all 보유 시 전체.
create policy applications_select on public.applications
  for select to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'applications.view_all'))
  );

-- 수정: 자기 배정 건 또는 applications.assign(담당자 배정 권한).
create policy applications_update on public.applications
  for update to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'applications.assign'))
  )
  with check (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'applications.assign'))
  );

create policy applications_delete on public.applications
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'users.manage')));
