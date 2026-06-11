-- 롤백 — claim_next_job을 스테일 회수 이전(queued만 claim)으로 복원.
-- 원본: 20260607140000_jobs_queue.sql
create or replace function public.claim_next_job()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_row public.jobs;
begin
  select id into v_id
  from public.jobs
  where status = 'queued'
  order by created_at
  for update skip locked
  limit 1;

  if v_id is null then
    return null;
  end if;

  update public.jobs
  set status = 'processing', attempts = attempts + 1, updated_at = now()
  where id = v_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;
revoke all on function public.claim_next_job() from public, anon, authenticated;
grant execute on function public.claim_next_job() to service_role;
