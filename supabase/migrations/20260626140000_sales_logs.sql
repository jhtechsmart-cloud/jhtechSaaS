-- 영업일지(sales_logs) — 내부용. 업체별로 영업담당이 기록하는 메모(견적 작성 시 참고).
-- PDF·고객에게는 미노출. 고객 상세 + 견적 작성 화면에서 조회, 작성자별 모아보기 가능.
-- 스코프 = 부모 company 접근권(담당 OR customers.view_all) + 본인 작성분(company_equipment 패턴 미러).
-- 별도 capability 없이 customers.view_all + companies.assignee + 작성자 본인으로 통제.

create table public.sales_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_logs_content_len check (char_length(content) between 1 and 4000)
);
-- 업체별 최신순 조회 + 작성자별 모아보기.
create index sales_logs_company_idx on public.sales_logs (company_id, created_at desc);
create index sales_logs_author_idx on public.sales_logs (author_id, created_at desc);

-- 서버 통제값: author_id=현재 사용자 강제(클라 미신뢰), created_at·company_id 불변(감사).
create or replace function public.sales_logs_enforce_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := (select auth.uid()); -- 작성자 = 현재 사용자(클라 입력 무시)
    new.created_at := now();
    new.updated_at := now();
  elsif tg_op = 'UPDATE' then
    new.author_id := old.author_id;   -- 불변
    new.company_id := old.company_id; -- 불변(타 업체로 이동 불가)
    new.created_at := old.created_at; -- 불변
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger sales_logs_server_fields
  before insert or update on public.sales_logs
  for each row execute function public.sales_logs_enforce_server_fields();

alter table public.sales_logs enable row level security;

-- SELECT: 본인 작성분 OR 부모 company가 본인 담당/전체조회.
create policy sales_logs_select on public.sales_logs
  for select to authenticated using (
    author_id = (select auth.uid())
    or exists (
      select 1 from public.companies c
      where c.id = company_id
        and (
          c.assignee_id = (select auth.uid())
          or (select public.has_permission((select auth.uid()), 'customers.view_all'))
        )
    )
  );
-- INSERT: 부모 company 접근권(담당 OR view_all). author_id는 트리거가 auth.uid()로 강제.
--   (BEFORE 트리거가 먼저 author_id를 세팅 → with check는 company 접근만 확인.)
create policy sales_logs_insert on public.sales_logs
  for insert to authenticated
  with check (
    exists (
      select 1 from public.companies c
      where c.id = company_id
        and (
          c.assignee_id = (select auth.uid())
          or (select public.has_permission((select auth.uid()), 'customers.view_all'))
        )
    )
  );
-- UPDATE: 작성자 본인 OR 관리자(users.manage).
create policy sales_logs_update on public.sales_logs
  for update to authenticated
  using (
    author_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'users.manage'))
  )
  with check (
    author_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'users.manage'))
  );
-- DELETE: 작성자 본인 OR 관리자(users.manage).
create policy sales_logs_delete on public.sales_logs
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'users.manage'))
  );
