-- 고객 목록 테이블 개편 — 서버사이드 통합검색·필터·정렬의 DB 기반.
--  ① pg_trgm + generated column: 하이픈 무시 검색(전화·사업자번호)과 업체명 부분일치 인덱스
--  ② companies_list 뷰(security_invoker): region(시·도)·거래현황 카운트·최근활동
--     — RLS는 베이스 테이블 정책이 그대로 적용(영업=본인 담당만, 카운트도 가시범위 기준)
-- rollback: supabase/rollback/20260612120000_companies_list_search_down.sql

create extension if not exists pg_trgm;

-- 하이픈 무시 통합검색 — 전화류·사업자번호의 숫자만 모은 generated column(공백 구분 유지).
alter table public.companies
  add column if not exists search_digits text generated always as (
    -- concat_ws는 IMMUTABLE이 아니라 generated column에 불가 → ||(textcat)로
    regexp_replace(
      coalesce(biz_no, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(phone1, '') || ' ' ||
      coalesce(phone2, '') || ' ' || coalesce(mobile, '') || ' ' || coalesce(fax, ''),
      '[^0-9 ]', '', 'g'
    )
  ) stored;

-- 견적 카운트 조인 키 — applications.biz_no는 하이픈 잔존 가능(과거 직접 POST 데이터).
alter table public.applications
  add column if not exists biz_no_digits text generated always as (
    regexp_replace(coalesce(biz_no, ''), '\D', '', 'g')
  ) stored;

-- 검색·조인 인덱스
create index if not exists companies_name_trgm_idx on public.companies using gin (name gin_trgm_ops);
create index if not exists companies_search_digits_trgm_idx on public.companies using gin (search_digits gin_trgm_ops);
create index if not exists applications_biz_no_digits_idx on public.applications (biz_no_digits);

-- 고객 목록 뷰 — security_invoker라 호출자 RLS 그대로(영업=본인 담당 고객·신청만 집계).
create or replace view public.companies_list
with (security_invoker = on) as
select
  c.id,
  c.name,
  c.ledger_no,
  c.ledger_name,
  c.biz_no,
  c.ceo,
  c.manager,
  c.phone,
  c.phone1,
  c.mobile,
  c.address,
  c.search_digits,
  c.assignee_id,
  p.name as assignee_name,
  c.created_at,
  c.updated_at,
  -- 시·도 추출(표시·필터용) — 웹 regionOf()와 동일 규칙
  case
    when c.address like '서울%' then '서울'
    when c.address like '부산%' then '부산'
    when c.address like '대구%' then '대구'
    when c.address like '인천%' then '인천'
    when c.address like '광주%' then '광주'
    when c.address like '대전%' then '대전'
    when c.address like '울산%' then '울산'
    when c.address like '세종%' then '세종'
    when c.address like '경기%' then '경기'
    when c.address like '강원%' then '강원'
    when c.address like '충청북도%' or c.address like '충북%' then '충북'
    when c.address like '충청남도%' or c.address like '충남%' then '충남'
    when c.address like '전라북도%' or c.address like '전북%' then '전북'
    when c.address like '전라남도%' or c.address like '전남%' then '전남'
    when c.address like '경상북도%' or c.address like '경북%' then '경북'
    when c.address like '경상남도%' or c.address like '경남%' then '경남'
    when c.address like '제주%' then '제주'
    else null
  end as region,
  -- 거래현황(가시범위 기준 카운트)
  (select count(*)::int from public.applications a
    where (c.biz_no is not null and a.biz_no_digits = c.biz_no)
       or (c.source_application_id is not null and a.id = c.source_application_id)
  ) as quotes_count,
  (select count(*)::int from public.company_equipment ce where ce.company_id = c.id) as equipment_count,
  (select count(*)::int from public.service_requests sr where sr.company_id = c.id) as as_count,
  -- 최근 거래활동(견적·AS·소모품 최신 시각) — 활동이 없으면 null(이관 고객의 updated_at 오인 방지)
  greatest(
    (select max(a.created_at) from public.applications a
      where (c.biz_no is not null and a.biz_no_digits = c.biz_no)
         or (c.source_application_id is not null and a.id = c.source_application_id)),
    (select max(sr.created_at) from public.service_requests sr where sr.company_id = c.id),
    (select max(spr.created_at) from public.supply_requests spr where spr.company_id = c.id)
  ) as activity_at
from public.companies c
left join public.profiles p on p.id = c.assignee_id;

grant select on public.companies_list to authenticated;
revoke all on public.companies_list from anon;
