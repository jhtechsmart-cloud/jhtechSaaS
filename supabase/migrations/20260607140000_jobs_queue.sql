-- E5 백엔드 #3 — jobs 큐 + 발행 시 PDF enqueue 트리거 + claim RPC.
-- 무거운/비동기 작업(PDF·향후 메일)을 Railway 워커가 FOR UPDATE SKIP LOCKED로 폴링 처리(webhook/Realtime 회피).

-- 1. jobs 큐 테이블. 내부 전용 — RLS enable + 정책 0(워커=service_role 우회, claim=DEFINER RPC).
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null, -- 'quote_pdf' (향후 'email' 등)
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.jobs (status, created_at);
alter table public.jobs enable row level security;
-- 정책 없음 = anon/authenticated 직접 접근 0.

-- 2. enqueue 트리거 — 견적이 'issued'로 전환될 때만 PDF 잡 1건. pdf_url 갱신(issued→issued)은 제외.
create or replace function public.quotes_enqueue_pdf()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status is distinct from 'issued') then
    insert into public.jobs (type, payload)
    values ('quote_pdf', jsonb_build_object('quote_id', new.id));
  end if;
  return null; -- AFTER 트리거
end;
$$;

create trigger quotes_enqueue_pdf_trg
  after insert or update on public.quotes
  for each row execute function public.quotes_enqueue_pdf();

-- 3. claim_next_job — FOR UPDATE SKIP LOCKED로 queued 1건을 원자적으로 집어 processing 전이.
-- 동시 워커 레이스 0. service_role만 실행(워커).
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
