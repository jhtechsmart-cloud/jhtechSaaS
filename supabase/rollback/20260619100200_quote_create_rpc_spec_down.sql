-- 롤백 — spec_selection 인자 제거 버전으로 되돌림(신규 시그니처만 제거).
-- ⚠️⚠️ 이 스크립트만 단독 실행하면 create_quote·create_manual_quote·_quote_insert 세 함수가
--      모두 사라져 견적 작성이 즉시 장애가 된다. 롤백 시 반드시 직후에 원본 함수를 복원할 것:
--        psql -f supabase/migrations/20260607130000_quote_create_rpc.sql
--      (또는 20260607130000을 다시 적용). 그래야 4/4/7인자 원본 시그니처가 되살아난다.
drop function if exists public.create_quote(uuid, jsonb, jsonb, text, jsonb);
drop function if exists public.create_manual_quote(text, text, text, text, jsonb, jsonb, text, jsonb);
drop function if exists public._quote_insert(uuid, jsonb, jsonb, text, jsonb);
