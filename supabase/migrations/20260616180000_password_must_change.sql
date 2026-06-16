-- 비밀번호 변경 기능 — 임시 비밀번호 상태 표시 플래그.
-- 의도: 계정 생성·관리자 재설정 시 true, 본인이 비밀번호를 바꾸면 false.
--   true인 동안 admin 콘솔 layout이 강제 변경 패널을 띄워 콘솔 사용을 막는다.
-- RLS: 기존 profiles_update 정책(users.manage만)이 그대로 적용 → 일반 직원은 이 플래그를
--   스스로 끌 수 없다. 해제는 본인 변경 서버 액션이 admin(service_role) 클라이언트로 수행.
-- rollback: supabase/rollback/20260616180000_password_must_change_down.sql

alter table public.profiles
  add column must_change_password boolean not null default false;
