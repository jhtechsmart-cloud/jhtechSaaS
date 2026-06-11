-- B 보안 — applications의 anon 직접 INSERT 정책 제거(공개 신청 = submit_application RPC 전용).
-- 문제: E-5 초기 정책(applications_insert_anon)이 남아 있어, anon 키로 /rest/v1/applications에
-- 직접 POST하면 RPC의 서버측 검증(개인정보 동의 + privacy_policies 버전 대조, biz_no 체크섬,
-- equipment active)을 전부 우회해 동의 기록 없는 신청 행을 만들 수 있었다.
-- service_requests·supply_requests는 처음부터 anon INSERT 정책 없이 RPC 전용 — applications만 예외였던 것을 통일.
drop policy if exists applications_insert_anon on public.applications;
