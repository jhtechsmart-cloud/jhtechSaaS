-- E1 Foundation #4 — applications + 전역 seq 채번 + anon 공개폼 INSERT + assignee row scope
-- D2: 전역 Postgres sequence(레이스 0). E-4: row scope = assignee OR view_all. E-5: anon WITH CHECK.

create sequence public.application_seq;

-- 채번 함수: REQ-YYYYMMDD-NNNNN. SECURITY DEFINER로 nextval 수행(호출자 sequence 권한 불필요).
-- 날짜는 KST(Asia/Seoul) — 한국 단일테넌트라 고객 접수번호가 KST 기준이어야 함.
-- NNNNN은 최소 5자리 0패딩이되 10만 건 초과 시 잘리지 않고 자릿수가 늘어난다(lpad 잘림 버그 회피).
create or replace function public.next_application_seq_no()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v bigint := nextval('public.application_seq');
begin
  return 'REQ-'
    || to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDD')
    || '-'
    || case when v >= 100000 then v::text else lpad(v::text, 5, '0') end;
end;
$$;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  seq_no text unique not null,  -- 트리거가 항상 서버 생성(아래). 클라 지정 무시.
  company text not null,
  ceo text,
  biz_no text,
  phone text,
  email text,
  address text,
  status text not null default 'new' check (status in ('new', 'assigned', 'quoted', 'closed')),
  assignee_id uuid references public.profiles (id),
  fields jsonb not null default '{}',
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.applications (assignee_id);
create index on public.applications (status);
create index on public.applications (created_at desc);

alter table public.applications enable row level security;

-- 컬럼 신뢰경계: seq_no·created_at는 서버 통제값. RLS는 행 단위라 컬럼 위조를 못 막고,
-- Postgres 컬럼 GRANT는 테이블 GRANT가 있으면 빼낼 수 없어 REVOKE도 무력 →
-- BEFORE 트리거로 강제: INSERT 시 seq_no는 항상 서버 생성(클라 지정 무시), created_at=now().
-- UPDATE 시 seq_no·created_at는 OLD 값 보존(변조 불가). service_role도 트리거는 우회 못 함 → 일관.
create or replace function public.applications_enforce_server_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.seq_no := public.next_application_seq_no();
    new.created_at := now();
  elsif tg_op = 'UPDATE' then
    new.seq_no := old.seq_no;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger applications_server_fields
  before insert or update on public.applications
  for each row execute function public.applications_enforce_server_fields();

-- E-5: 공개 폼 — anon은 INSERT만, status='new' + 미배정 강제. SELECT 금지.
create policy applications_insert_anon on public.applications
  for insert to anon
  with check (status = 'new' and assignee_id is null);

-- E-4: 로그인 사용자는 자기 배정 건 OR applications.view_all 보유 시 전체.
create policy applications_select on public.applications
  for select to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'applications.view_all'))
  );

-- 수정: 자기 배정 건 또는 applications.assign(담당자 배정 권한).
create policy applications_update on public.applications
  for update to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'applications.assign'))
  )
  with check (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'applications.assign'))
  );

create policy applications_delete on public.applications
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'users.manage')));
