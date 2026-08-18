-- profiles.department — 소속 부서(영업부/기술부/관리부). 담당자 선택 목록을 부서로 좁히기 위한 필드.
-- 값은 코드 키(sales/tech/management)로 저장, 라벨은 앱(apps/web/src/lib/users/department.ts)이 담당.
-- null = 부서 미지정(대표·공장장·디자인팀 등). 롤백: supabase/rollback/20260818120000_profiles_department_down.sql

alter table public.profiles
  add column if not exists department text
    constraint profiles_department_check check (department in ('sales', 'tech', 'management'));

comment on column public.profiles.department is
  '소속 부서 키(sales=영업부, tech=기술부, management=관리부, null=미지정). 담당자 선택 목록 필터에 사용.';

-- 1회 백필: 기존 직책(position) 문자열에 부서명이 들어 있는 사람만 매핑. 그 외는 null 유지.
-- (직책 문자열 자체는 건드리지 않는다.)
update public.profiles
set department = case
  when position like '%영업부%' then 'sales'
  when position like '%기술부%' then 'tech'
  when position like '%관리부%' then 'management'
  else null
end
where department is null
  and position is not null
  and (position like '%영업부%' or position like '%기술부%' or position like '%관리부%');
