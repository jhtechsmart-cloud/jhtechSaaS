-- 롤백 #285 ③(RPC). ④(정책) down 뒤, ②(트리거) down 앞에 실행.
-- 신규 RPC 5개 drop + 재정의 RPC 6개는 원본 마이그레이션 본문으로 복원한다.
-- 원본 본문은 파일 그대로 다시 적용하면 된다(create or replace이므로 재실행 안전):
--   psql -f supabase/migrations/20260716170100_service_reports_rpc.sql   (void / resolve_service_report_follow — 단, 같은 파일의
--        enqueue_email 트리거 생성문이 포함돼 있으니 ② down 주석의 수동 복원 정책에 맞춰 필요 시 트리거를 다시 drop)
--   psql -f supabase/migrations/20260716200000_service_report_pdf_status.sql  (retry_service_report_pdf)
--   psql -f supabase/migrations/20260720170000_service_report_catalog_link.sql (upsert / issue — 컬럼 추가문은 if not exists라 안전)
--   psql -f supabase/migrations/20260720190000_service_reports_view_permission.sql (get_service_report_pdf_status·정책 — ④ down과 중복 적용 무해)
-- 위 파일들은 ①의 컬럼이 아직 존재하는 상태에서 실행해야 한다(① down은 마지막).

drop function if exists public.get_service_report_approval_notice(uuid);
drop function if exists public.service_report_kpis();
drop function if exists public.enqueue_service_report_email(uuid);
drop function if exists public.complete_service_report(uuid, text, date, text);
drop function if exists public.approve_service_report(uuid);

-- 재정의 복원(위 psql -f 4건). 아래는 순서 안내용 — 이 파일 실행 후 순서대로 적용:
--   1) 20260716170100_service_reports_rpc.sql
--   2) 20260716200000_service_report_pdf_status.sql
--   3) 20260720170000_service_report_catalog_link.sql
--   4) 20260720190000_service_reports_view_permission.sql
-- 그 다음 ②(트리거) down → ①(스키마) down.
