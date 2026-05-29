-- E1 Foundation #2 — capability 권한 헬퍼 + profiles RLS 정책
-- has_permission: 모든 RLS 정책이 호출하는 단일 권한 판정 함수.
-- E-2: SECURITY DEFINER + search_path='' + STABLE → 재귀·권한상승·성능(InitPlan) 표준.

create or replace function public.has_permission(uid uuid, perm text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.is_active
      and (perm = any (p.permissions) or 'users.manage' = any (p.permissions))
  );
$$;
-- null uid(anon) → 매칭 row 없음 → false. users.manage 보유 = 전체 우회.

-- profiles RLS — 본인 또는 users.manage 관리자만. 직접 서브쿼리 금지(헬퍼만 → 재귀 회피).
-- 정책은 (select ...) 래핑으로 InitPlan 1회 평가.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'users.manage'))
  );

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'users.manage')));

create policy profiles_update on public.profiles
  for update to authenticated
  using ((select public.has_permission((select auth.uid()), 'users.manage')))
  with check ((select public.has_permission((select auth.uid()), 'users.manage')));

create policy profiles_delete on public.profiles
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'users.manage')));
