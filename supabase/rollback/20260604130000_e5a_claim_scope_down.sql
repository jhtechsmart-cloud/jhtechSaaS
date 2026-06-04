-- E5a #38 step3 롤백 — 신청 3종 self-claim RLS 제거, step2 직후 상태로 복원.
-- applications: claim 절 제거. service/supply: claim 절 제거 + WITH CHECK 게이트 view_all → manage 복원.

-- ── applications ──
drop policy if exists applications_select on public.applications;
create policy applications_select on public.applications
  for select to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'applications.view_all'))
  );

drop policy if exists applications_update on public.applications;
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

-- ── service_requests ──
drop policy if exists service_requests_select on public.service_requests;
create policy service_requests_select on public.service_requests
  for select to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'service_requests.view_all'))
  );

drop policy if exists service_requests_update on public.service_requests;
create policy service_requests_update on public.service_requests
  for update to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'service_requests.manage'))
  )
  with check (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'service_requests.manage'))
  );

-- ── supply_requests ──
drop policy if exists supply_requests_select on public.supply_requests;
create policy supply_requests_select on public.supply_requests
  for select to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'supply_requests.view_all'))
  );

drop policy if exists supply_requests_update on public.supply_requests;
create policy supply_requests_update on public.supply_requests
  for update to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'supply_requests.manage'))
  )
  with check (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'supply_requests.manage'))
  );
