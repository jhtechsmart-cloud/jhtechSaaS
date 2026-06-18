-- 롤백 — spec_selection 인자 제거 버전으로 되돌림(신규 시그니처만 제거).
-- ⚠️ 원본 함수(20260607130000 시그니처) 복원은 그 마이그레이션 재적용으로.
drop function if exists public.create_quote(uuid, jsonb, jsonb, text, jsonb);
drop function if exists public.create_manual_quote(text, text, text, text, jsonb, jsonb, text, jsonb);
drop function if exists public._quote_insert(uuid, jsonb, jsonb, text, jsonb);
