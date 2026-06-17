-- 롤백: 장비출고의뢰서 작성/발행 RPC + enqueue 트리거 제거.
drop function if exists public.issue_release_order(uuid);
drop function if exists public.upsert_release_order(uuid, text, jsonb);
drop trigger if exists release_orders_enqueue_pdf_trg on public.release_orders;
drop function if exists public.release_orders_enqueue_pdf();
