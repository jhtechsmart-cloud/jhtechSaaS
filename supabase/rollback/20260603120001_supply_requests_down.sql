-- M2 P-E #23 롤백 — supply_requests(+items) + RPC 3개 + seq. 적용 역순(RPC→items→requests→seq).
-- ⚠️ supabase/rollback/(단수)에 둔다. migrations/에 두면 같은 타임스탬프가 마이그레이션으로 적용돼 되돌림.
-- 권한 키(supply_requests.view_all/.manage)는 packages/shared/src/permissions.ts에서 코드로 제거(데이터 마이그레이션 불필요).

drop function if exists public.submit_supply_request(jsonb);
drop function if exists public.last_supply_request_for_company(text);
drop function if exists public.list_consumables_for_company(text);

drop table if exists public.supply_request_items;
drop table if exists public.supply_requests;

drop function if exists public.supply_request_items_enforce_server_fields();
drop function if exists public.supply_requests_enforce_server_fields();
drop function if exists public.next_supply_request_seq_no();

drop sequence if exists public.supply_request_seq;
