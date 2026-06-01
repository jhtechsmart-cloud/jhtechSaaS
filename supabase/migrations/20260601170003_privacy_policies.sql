-- M2 P-A — 개인정보처리방침 버전 테이블. 동의 시 version 기록.
create table public.privacy_policies (
  id uuid primary key default gen_random_uuid(),
  version text unique not null,
  body text not null,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.privacy_policies enable row level security;

-- 동의 문구는 공개 표시 → anon·authenticated SELECT.
create policy privacy_policies_select on public.privacy_policies
  for select to anon, authenticated using (true);

create policy privacy_policies_insert on public.privacy_policies
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'users.manage')));

create policy privacy_policies_update on public.privacy_policies
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'users.manage')))
  with check ((select public.has_permission((select auth.uid()), 'users.manage')));

create policy privacy_policies_delete on public.privacy_policies
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'users.manage')));

-- 플레이스홀더 v1.0(법무 확정 후 행 업데이트/신버전).
insert into public.privacy_policies (version, body)
values ('v1.0', '[플레이스홀더 — 법무 확정 후 교체]');
