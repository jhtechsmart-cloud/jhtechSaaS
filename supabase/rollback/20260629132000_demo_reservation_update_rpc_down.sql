-- 롤백: 데모예약 수정 RPC 제거.
drop function if exists public.update_demo_reservation(uuid,uuid,text,text,text,uuid,text,tstzrange,uuid[]);
