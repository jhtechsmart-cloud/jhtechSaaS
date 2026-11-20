-- 20261120100600 되돌리기 — simulated 컬럼 제거(기록된 테스트 모드 표시는 사라진다).
alter table public.email_log drop column if exists simulated;
