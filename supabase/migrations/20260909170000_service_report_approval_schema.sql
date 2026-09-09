-- #285 서비스 리포트 결재 흐름 ① 스키마.
-- 상태 5종(draft→issued→approved→completed, voided) + 승인·완료·세금계산서·기사서명·후속 부모·PDF 세대 컬럼,
-- 관리자 직인 포인터, email_log 종류(kind)/재발송 허용 인덱스, jobs 지연 실행(run_after)·중복 방지 인덱스.
-- 트리거·RPC·정책은 ②③④ 마이그. 롤백 = supabase/rollback/20260909170000_service_report_approval_schema_down.sql.

-- 1. 상태 CHECK 확장
alter table public.service_reports drop constraint if exists service_reports_status_check;
alter table public.service_reports
  add constraint service_reports_status_check
  check (status in ('draft', 'issued', 'approved', 'completed', 'voided'));

-- 2. 컬럼
alter table public.service_reports
  -- <id>/engineer-signature.png (draft에서 기록, PDF 결재 '담당' 칸)
  add column if not exists engineer_signature_path text,
  -- PDF 세대. issue·approve 전이마다 트리거가 +1. 워커는 payload.revision과 다르면 결과를 폐기(stale-write 차단, D-C8)
  add column if not exists pdf_revision int not null default 0,
  add column if not exists approved_at timestamptz,
  -- set null은 동결 트리거·CHECK와 충돌해 사용자 삭제가 실패하므로 no action + 앱 delete-blockers로 안내(D-C18)
  add column if not exists approved_by uuid references public.profiles (id) on delete no action,
  add column if not exists approver_name text,            -- 승인 시 profiles.name 스냅샷
  add column if not exists approver_title text,           -- 승인 시 profiles.position 스냅샷
  -- 승인 시점의 직인 원본 경로 스냅샷(approval-stamps 버킷). 파일명이 버전(stamp-<epoch>)이라 이후 교체와 무관
  add column if not exists approver_stamp_path text,
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references public.profiles (id) on delete no action,
  add column if not exists tax_invoice_status text
    constraint service_reports_tax_invoice_status_check check (tax_invoice_status in ('invoiced', 'not_required')),
  add column if not exists tax_invoice_date date,
  add column if not exists tax_invoice_memo text
    constraint service_reports_tax_invoice_memo_check check (tax_invoice_memo is null or length(tax_invoice_memo) <= 500),
  -- 후속 리포트(1단만 — 부모의 parent_report_id는 null이어야 함, issue RPC가 검증)
  add column if not exists parent_report_id uuid references public.service_reports (id) on delete set null;

alter table public.service_reports
  add constraint service_reports_completed_tax_check
    check (status <> 'completed' or tax_invoice_status is not null),
  add constraint service_reports_approved_at_check
    check (status not in ('approved', 'completed') or approved_at is not null),
  add constraint service_reports_engineer_sig_path_check
    check (engineer_signature_path is null
           or engineer_signature_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/engineer-signature\.png$');

create index if not exists service_reports_status_idx on public.service_reports (status);
create index if not exists service_reports_parent_idx on public.service_reports (parent_report_id);
-- 후속조치 대기 부분 인덱스: issued 전용 → 발행 이후 3상태(승인·완료본의 후속조치도 대기 목록에 남아야 함)
drop index if exists public.service_reports_follow_open;
create index service_reports_follow_open on public.service_reports (follow_date)
  where follow_needed and follow_resolved_at is null and status in ('issued', 'approved', 'completed');

comment on column public.service_reports.pdf_revision is
  'PDF 세대. issue·approve 전이 시 트리거가 +1. 워커는 잡 payload.revision과 다르면 렌더 결과를 폐기(CAS).';
comment on column public.service_reports.tax_invoice_status is
  'invoiced=세금계산서 발행함 / not_required=발행 불필요(관리부 완료 시 기록). 리포트 status와 값이 겹치지 않게 issued 대신 invoiced.';

-- 3. 관리자 직인(승인 권한자) — 버전 파일명(stamp-<epoch>.<ext>) 강제: 덮어쓰기 없음 → 승인본 스냅샷 불변
alter table public.profiles
  add column if not exists approval_stamp_path text
    constraint profiles_approval_stamp_path_check
    check (approval_stamp_path is null
           or approval_stamp_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/stamp-[0-9]+\.(png|jpg|jpeg|webp)$');
comment on column public.profiles.approval_stamp_path is
  '결재 직인·서명 이미지(approval-stamps 버킷). 교체 시 새 버전 파일을 올리고 포인터만 바꾼다(이미 승인된 문서 불변).';

-- 4. email_log: 종류 구분 + 재발송 허용(sent 제외, 견적 20260617120000 동형)
alter table public.email_log
  add column if not exists kind text not null default 'customer'
    constraint email_log_kind_check check (kind in ('customer', 'approval_notice'));
drop index if exists public.email_log_active_service_report;
create unique index email_log_active_service_report
  on public.email_log (service_report_id)
  where status in ('pending', 'sending') and kind = 'customer';

-- 5. jobs: 지연 실행 + 중복 방지
alter table public.jobs add column if not exists run_after timestamptz;
create index if not exists jobs_claim_idx on public.jobs (status, run_after, created_at);
-- PDF 잡: 같은 리포트의 queued 1건(전이가 연달아 오면 트리거가 기존 queued의 payload를 최신 세대로 갱신)
-- 운영 큐에 같은 리포트의 queued 잡이 2건 이상 남아 있으면 유니크 생성이 실패하므로 최신 1건만 남기고 정리
delete from public.jobs j
  using public.jobs k
  where j.type = 'service_report_pdf' and k.type = 'service_report_pdf'
    and j.status = 'queued' and k.status = 'queued'
    and j.payload ->> 'service_report_id' = k.payload ->> 'service_report_id'
    and j.created_at < k.created_at;
create unique index if not exists jobs_service_report_pdf_queued_uniq
  on public.jobs ((payload ->> 'service_report_id'))
  where type = 'service_report_pdf' and status = 'queued';
-- 승인 알림 잡: 리포트·kind(initial/reminder)별 활성 1건
create unique index if not exists jobs_service_report_notice_active_uniq
  on public.jobs ((payload ->> 'service_report_id'), (payload ->> 'kind'))
  where type = 'service_report_approval_notice' and status in ('queued', 'processing');

-- 6. claim_next_job — ⚠️ 최신판(20260611120000, 스테일 회수·3회 한도 포함) 기준 + run_after 조건.
--    구판(20260607140000) 기준으로 재정의하면 죽은 워커의 잡 회수가 사라진다.
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
  -- 회수 한도(3회)를 소진한 스테일 잡은 영구 processing 좀비가 되지 않게 failed로 확정
  update public.jobs
  set status = 'failed',
      last_error = 'stale: 회수 한도 초과(워커 사망 추정)',
      updated_at = now()
  where status = 'processing'
    and updated_at < now() - interval '5 minutes'
    and attempts >= 3;

  select id into v_id
  from public.jobs
  where (
          status = 'queued'
          and (run_after is null or run_after <= now())   -- 지연 잡(승인 재알림)은 도래 전 집지 않는다
        )
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
revoke all on function public.claim_next_job() from public, anon, authenticated;
grant execute on function public.claim_next_job() to service_role;
