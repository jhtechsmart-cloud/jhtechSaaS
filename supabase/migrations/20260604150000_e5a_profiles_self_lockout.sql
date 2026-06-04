-- E5a /review 후속 — profiles 자가 락아웃 방어 트리거(방어심화).
-- updateUserPermissions/setUserActive 앱 가드가 UI 경로를 막지만, RLS(profiles_update=users.manage)는
-- 본인 행 직접 PATCH를 막지 못해 관리자가 직접 API로 본인 users.manage 회수·본인 비활성화가 가능했다.
-- 단일관리자 테넌트에서 이는 전체 콘솔 영구 락아웃(복구=seed/SQL)이라 DB레벨로 강제한다.
-- service_role(auth.uid() NULL)·관리자가 타인 편집은 무영향 — 본인(NEW.id = auth.uid())만 차단.
-- 프로젝트 패턴: 서버 통제 불변값은 BEFORE 트리거로(seq_no 등과 동일).
-- rollback: supabase/rollback/20260604150000_e5a_profiles_self_lockout_down.sql

create or replace function public.profiles_prevent_self_lockout()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is not null and new.id = v_uid then
    -- 본인 계정의 users.manage 자가 회수 금지(관리자 락아웃 방지).
    if ('users.manage' = any(old.permissions)) and not ('users.manage' = any(new.permissions)) then
      raise exception '본인 계정의 사용자 관리 권한은 회수할 수 없습니다' using errcode = '42501';
    end if;
    -- 본인 계정 자가 비활성화 금지.
    if old.is_active and not new.is_active then
      raise exception '본인 계정은 비활성화할 수 없습니다' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_self_lockout_guard
  before update on public.profiles
  for each row execute function public.profiles_prevent_self_lockout();
