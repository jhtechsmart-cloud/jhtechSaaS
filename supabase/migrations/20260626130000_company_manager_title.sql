-- 고객 담당자 직책(manager_title).
-- 견적서 PDF 수신처를 "[회사이름] 귀하" → "[회사이름] [담당자] [직책] 귀하"로 바꾸기 위해
-- 고객(거래처)에 담당자 직책 컬럼을 추가한다. 선택 항목(nullable), 최대 100자.
-- (20260609150000 companies_extended_fields와 동일 패턴 — 길이 CHECK.)
alter table public.companies
  add column manager_title text check (manager_title is null or char_length(manager_title) <= 100);

comment on column public.companies.manager_title is '고객 담당자 직책(견적서 PDF 수신처 표기용).';
