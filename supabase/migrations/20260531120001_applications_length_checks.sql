-- E3 #4 보안 — applications 컬럼 길이 CHECK 제약.
-- submit_application RPC의 길이 캡은 앱 레이어 전용. anon은 공개 키로 /rest/v1/applications에
-- 직접 INSERT 가능(E1 anon INSERT 정책)하므로 RPC를 우회해 무한 크기 값 저장 가능 → 저장소 남용.
-- CHECK 제약은 호출 경로와 무관(RPC·직접INSERT·service_role 모두)하게 DB가 강제 → 우회 불가.
-- nullable 컬럼은 NULL이면 CHECK 통과(length(NULL)=NULL). 캡 값은 RPC(20260531120000)와 동일.
alter table public.applications
  add constraint applications_company_len  check (length(company) <= 200),
  add constraint applications_ceo_len      check (length(ceo)     <= 200),
  add constraint applications_biz_no_len   check (length(biz_no)  <= 200),
  add constraint applications_phone_len    check (length(phone)   <= 200),
  add constraint applications_email_len    check (length(email)   <= 200),
  add constraint applications_address_len  check (length(address) <= 500),
  add constraint applications_fields_size  check (octet_length(fields::text) <= 8192);
