-- 롤백: applications.company_id + 인덱스 제거, 트리거 함수를 직전 정의(company_id 없는 20260607130000 버전)로 복원.
drop index if exists public.applications_company_idx;

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
    new.source := old.source;
  end if;
  return new;
end;
$$;

alter table public.applications drop column if exists company_id;
