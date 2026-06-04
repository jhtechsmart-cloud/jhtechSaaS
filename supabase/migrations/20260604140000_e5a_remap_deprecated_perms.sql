-- E5a #38 step6 — deprecated *.manage 키를 보유한 기존 profiles.permissions를 신규 키로 remap.
-- step2(customers)·step3(service/supply)이 RLS·RPC·액션을 이미 신규 키로 재배선했고,
-- registry에서도 .manage 3키를 삭제한다(코드). 남은 일 = 운영 계정 데이터의 스테일 키 정리.
-- remap(보수적): customers.manage→edit+view_all(delete는 admin 수동), service/supply.manage→status+view_all.
-- admin(users.manage super)은 .manage 키 미보유라 영향 0. 영향 행수는 RAISE NOTICE로 남긴다.
-- rollback: supabase/rollback/20260604140000_e5a_remap_deprecated_perms_down.sql

-- 순수 헬퍼(immutable) — 마이그레이션 본문과 db-test가 공유(SQL 중복 방지). dead 키 제거 후 신규 키 합치고 dedup.
create or replace function public.remap_deprecated_perms(perms text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct k), '{}')
  from unnest(
    array_remove(
      array_remove(
        array_remove(perms, 'customers.manage'),
        'service_requests.manage'),
      'supply_requests.manage')
    || case when 'customers.manage' = any(perms)
            then array['customers.edit', 'customers.view_all'] else '{}'::text[] end
    || case when 'service_requests.manage' = any(perms)
            then array['service_requests.status', 'service_requests.view_all'] else '{}'::text[] end
    || case when 'supply_requests.manage' = any(perms)
            then array['supply_requests.status', 'supply_requests.view_all'] else '{}'::text[] end
  ) k
$$;

-- 스테일 키 보유 행만 remap(다른 행은 손대지 않아 순서 보존). 영향 행수 로그.
do $$
declare
  v_count int;
begin
  with updated as (
    update public.profiles
    set permissions = public.remap_deprecated_perms(permissions)
    where permissions && array['customers.manage', 'service_requests.manage', 'supply_requests.manage']
    returning 1
  )
  select count(*) into v_count from updated;
  raise notice 'E5a step6 — deprecated *.manage remap: % profile(s) updated', v_count;
end $$;
