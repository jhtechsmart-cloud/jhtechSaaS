-- 데모예약 롤백 — 테이블·트리거 함수 제거.
-- btree_gist 확장은 다른 객체가 쓸 수 있어 남겨둔다(드롭 부작용 회피).

drop table if exists public.demo_reservations;
drop function if exists public.demo_reservations_enforce_server_fields();
