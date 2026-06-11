-- 워커 안정화 #1 — claim_next_job에 스테일 processing 회수(가시성 타임아웃) 추가.
-- 문제: 워커가 잡을 claim한 채 죽으면(Railway 재배포 SIGKILL·OOM 등) 잡이 processing으로
-- 영구 방치돼 PDF가 영영 생성되지 않았다. queued만 집던 claim 조건을 확장한다.
--  - 회수 대상: processing이면서 updated_at이 5분 이상 경과(PDF 1건 렌더는 수 초 → 5분이면 충분히 죽은 워커).
--  - attempts < 3 가드: 회수도 시도 횟수에 포함 — 잡 자체가 워커를 죽이는 경우(OOM 등)
--    5분마다 무한 크래시 루프가 되는 것을 차단(3 = 워커 MAX_ATTEMPTS와 동일).
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
     or (status = 'processing'
         and updated_at < now() - interval '5 minutes'
         and attempts < 3)
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
-- create or replace는 기존 grant를 보존하지만, 권한 의도를 명시적으로 재고정.
revoke all on function public.claim_next_job() from public, anon, authenticated;
grant execute on function public.claim_next_job() to service_role;
