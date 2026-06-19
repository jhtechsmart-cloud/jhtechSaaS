-- 견적서 PDF 사양 선택 #2 — 견적별 PDF 사양 선택 저장.
-- null = 구 견적(이 기능 이전) → 워커가 pdf:true/전체 폴백. 배열 = 명시 선택(빈배열=0개).
alter table public.quotes
  add column spec_selection jsonb;
