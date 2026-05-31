-- E3 P2 #4 롤백 — submit_application RPC 제거.
drop function if exists public.submit_application(jsonb);
