-- E5a #38 step3 — 신청 3종(applications/service_requests/supply_requests) self-claim RLS.
-- SELECT·UPDATE USING에 (assignee_id IS NULL AND has_permission(X.claim)) 절을 추가해
-- claim 보유자가 "미배정 풀"을 보고 본인으로 가져올 수 있게 한다.
-- UPDATE WITH CHECK에는 claim/ISNULL절을 넣지 않는다 → "본인으로 가져오기"만 허용되고
-- 미배정 행을 타인에게 배정하거나 인플레이스 수정하는 권한 상승(escalation)은 막힌다.
-- service/supply UPDATE WITH CHECK 게이트는 deprecated 'manage' → 'view_all'로 교체
-- (step6에서 *.manage 키 삭제 예정. admin=users.manage super는 전부 자동 통과).
--
-- ⚠️ 설계 결정(/review D2, 수용): `*.status` 권한은 **앱레이어 게이트**(updateXStatus 액션)이고
--    RLS의 쓰기 경계는 **소유권**(assignee=self)이다. 즉 본인 배정/맡은 행은 RLS상 모든 컬럼
--    수정 가능 → status 권한 없이도 본인 행 status를 직접 PATCH할 수 있다(특히 claim 시 동시 변경).
--    표준 SALES_PRESET은 claim+status를 묶어 부여하므로 실사용 영향 0. status를 RLS 경계로 승격하려면
--    별도 BEFORE 트리거(claim의 new→assigned 자동범프 예외 처리 포함)가 필요 — 향후 필요 시 도입.
-- rollback: supabase/rollback/20260604130000_e5a_claim_scope_down.sql

-- ── applications ──
drop policy if exists applications_select on public.applications;
create policy applications_select on public.applications
  for select to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'applications.view_all'))
    or (assignee_id is null and (select public.has_permission((select auth.uid()), 'applications.claim')))
  );

drop policy if exists applications_update on public.applications;
create policy applications_update on public.applications
  for update to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'applications.assign'))
    or (assignee_id is null and (select public.has_permission((select auth.uid()), 'applications.claim')))
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
    or (assignee_id is null and (select public.has_permission((select auth.uid()), 'service_requests.claim')))
  );

drop policy if exists service_requests_update on public.service_requests;
create policy service_requests_update on public.service_requests
  for update to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'service_requests.view_all'))
    or (assignee_id is null and (select public.has_permission((select auth.uid()), 'service_requests.claim')))
  )
  with check (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'service_requests.view_all'))
  );

-- ── supply_requests ──
drop policy if exists supply_requests_select on public.supply_requests;
create policy supply_requests_select on public.supply_requests
  for select to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'supply_requests.view_all'))
    or (assignee_id is null and (select public.has_permission((select auth.uid()), 'supply_requests.claim')))
  );

drop policy if exists supply_requests_update on public.supply_requests;
create policy supply_requests_update on public.supply_requests
  for update to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'supply_requests.view_all'))
    or (assignee_id is null and (select public.has_permission((select auth.uid()), 'supply_requests.claim')))
  )
  with check (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'supply_requests.view_all'))
  );
