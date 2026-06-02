-- 롤백: P-D submit_service_request RPC (#22)
drop function if exists public.submit_service_request(jsonb);
