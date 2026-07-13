-- 롤백 — 10-arg RPC drop 후 9-arg 재생성·동결 트리거 원복은 원본 마이그(20260630120000·20260626160000) 참조.
-- 컬럼·10-arg 함수 제거. (동결 트리거의 hq_address 라인은 원본 재적용으로 원복.)
drop function if exists public.upsert_release_order(uuid, text, jsonb, text, text, text, text, text, text, text);
alter table public.release_orders drop column if exists hq_address;
