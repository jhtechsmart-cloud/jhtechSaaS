-- 롤백: 견적→고객 담당영업 전파 함수 제거.
drop function if exists public.sync_company_assignee_from_application(uuid);
