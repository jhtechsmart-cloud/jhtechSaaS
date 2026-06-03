-- 롤백: M2 P-F #24 통합 고객이력 RPC 제거. 테이블 정책 변경 없어 단순 drop.
drop function if exists public.get_company_request_history(uuid);
