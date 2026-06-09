-- #5a — companies 확장 필드(거래처 장부 항목, 엑셀 이관 대비).
-- 견적 신청기업 정보 레이아웃과 1:1: 담당자·업태(기본), 장부명·전화1/2·팩스·실제주소1/2(추가).
-- 전부 nullable text + 길이 CHECK. 기존 RLS·트리거 변경 없음(단순 컬럼 추가, 사용자 편집 컬럼).
-- applications에는 이 필드들이 없어 upsert_company_from_application RPC는 변경 불필요(신규 컬럼은 null).
-- rollback: supabase/rollback/20260609150000_companies_extended_fields_down.sql

alter table public.companies
  add column if not exists manager text,           -- 담당자(고객 측)
  add column if not exists biz_type text,          -- 업태
  add column if not exists biz_item text,          -- 업종(종목)
  add column if not exists ledger_name text,       -- 장부명(장부번호)
  add column if not exists phone1 text,            -- 전화1
  add column if not exists phone2 text,            -- 전화2
  add column if not exists fax text,               -- 팩스
  add column if not exists address_actual1 text,   -- 실제주소1
  add column if not exists address_actual2 text;   -- 실제주소2

alter table public.companies
  add constraint companies_manager_len check (manager is null or char_length(manager) <= 200),
  add constraint companies_biz_type_len check (biz_type is null or char_length(biz_type) <= 200),
  add constraint companies_biz_item_len check (biz_item is null or char_length(biz_item) <= 200),
  add constraint companies_ledger_name_len check (ledger_name is null or char_length(ledger_name) <= 200),
  add constraint companies_phone1_len check (phone1 is null or char_length(phone1) <= 50),
  add constraint companies_phone2_len check (phone2 is null or char_length(phone2) <= 50),
  add constraint companies_fax_len check (fax is null or char_length(fax) <= 50),
  add constraint companies_address_actual1_len check (address_actual1 is null or char_length(address_actual1) <= 500),
  add constraint companies_address_actual2_len check (address_actual2 is null or char_length(address_actual2) <= 500);
