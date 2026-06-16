-- 롤백: 견적 로고종류 컬럼 제거(설정값은 복구 불가 — 폐기됨).
alter table public.equipment_category
  drop constraint if exists equipment_category_quote_logo_kind_chk;
alter table public.equipment_category
  drop column if exists quote_logo_kind;
