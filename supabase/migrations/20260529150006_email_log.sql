-- E1 Foundation #6 — email_log (메일 발송 로그) + RLS
-- 발송 자체는 E6 워커(service_role). 여기선 스키마·RLS만.
-- INSERT: email.send. UPDATE(상태 전이): 워커(service_role)만 → authenticated UPDATE 정책 없음.

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,
  to_email text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  retry_count int not null default 0,
  error_msg text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.email_log (status);
create index on public.email_log (quote_id);

alter table public.email_log enable row level security;

-- SELECT: applications.view_all 또는 email.send.
create policy email_log_select on public.email_log
  for select to authenticated
  using (
    (select public.has_permission((select auth.uid()), 'applications.view_all'))
    or (select public.has_permission((select auth.uid()), 'email.send'))
  );

-- INSERT: email.send (발송 요청 enqueue). 워커는 service_role로 RLS 우회.
create policy email_log_insert on public.email_log
  for insert to authenticated
  with check ((select public.has_permission((select auth.uid()), 'email.send')));

-- UPDATE/DELETE 정책 없음 → 상태 전이는 service_role(워커)만, 삭제는 슈퍼유저만.
