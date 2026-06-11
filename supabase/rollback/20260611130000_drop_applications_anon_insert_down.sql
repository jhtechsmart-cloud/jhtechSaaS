-- 롤백 — applications anon 직접 INSERT 정책 복원.
-- 원본: 20260529150004_applications.sql (E-5)
create policy applications_insert_anon on public.applications
  for insert to anon
  with check (status = 'new' and assignee_id is null);
