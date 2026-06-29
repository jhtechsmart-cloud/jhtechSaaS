-- 롤백: create_demo_reservation RPC 제거.
drop function if exists public.create_demo_reservation(uuid,text,text,text,uuid,text,tstzrange,uuid[]);
