-- #285 ② 트리거. 전이는 (old.status, new.status) 쌍별 허용 컬럼 셋으로 검사한다(동일 상태 UPDATE는 pdf_url·follow_*만).
-- PDF 잡은 세대(pdf_revision)를 payload에 실어 워커가 stale 결과를 폐기할 수 있게 한다(D-C8).
-- 고객 메일 자동 발송 트리거는 제거(UC1: 수동 RPC enqueue_service_report_email로 대체, ③).
-- 원본: before_insert/before_update = 20260716170000, enqueue_pdf/enqueue_email = 20260716170100.

-- 1. BEFORE INSERT — 신규 서버 통제 컬럼까지 초기화(승인·완료·세금 필드는 INSERT로 못 채움)
create or replace function public.service_reports_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.seq_no := public.next_service_report_seq_no();
  new.created_at := now();
  if new.created_by is null then new.created_by := auth.uid(); end if;
  -- 발행/무효화는 RPC 경유만 — INSERT로 issued/voided 직행 차단
  new.status := 'draft';
  new.issued_at := null;
  new.pdf_url := null;
  new.pdf_revision := 0;
  new.voided_at := null; new.voided_by := null; new.void_reason := null;
  new.follow_resolved_at := null; new.follow_resolved_by := null;
  new.approved_at := null; new.approved_by := null;
  new.approver_name := null; new.approver_title := null; new.approver_stamp_path := null;
  new.completed_at := null; new.completed_by := null;
  new.tax_invoice_status := null; new.tax_invoice_date := null; new.tax_invoice_memo := null;
  return new;
end; $$;

-- 2. BEFORE UPDATE — 상태기계
--
--   draft ──issue──▶ issued ──approve──▶ approved ──complete──▶ completed
--                      │                    │
--                      └──void(관리자)───────┴──▶ voided        completed→voided ✗
--
--   상시: seq_no·created_at·created_by·pdf_revision 불변(pdf_revision은 전이 시 여기서만 +1).
--   전이는 tx-local 플래그(app.service_reports_status_change) 세팅한 RPC만.
--   동결 상태(issued/approved/completed)의 동일 상태 UPDATE 허용 컬럼 = pdf_url, follow_resolved_at, follow_resolved_by.
--   전이별 추가 허용 컬럼은 아래 case — 승인 필드는 issued→approved에서만, 세금 필드는 approved→completed에서만
--   쓸 수 있어 사후 변조(approved→approved에서 approved_by 교체 등)가 막힌다(D-C9).
create or replace function public.service_reports_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_common constant text[] := array['pdf_url', 'follow_resolved_at', 'follow_resolved_by'];
  v_allowed text[];
  v_check boolean := true;   -- draft 편집·draft→issued 전이만 전체 자유(확정 RPC가 스냅샷 기록)
begin
  new.seq_no := old.seq_no;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.pdf_revision := old.pdf_revision;

  if old.status = 'voided' then
    raise exception '무효화된 리포트는 수정할 수 없습니다';
  end if;

  if new.status is distinct from old.status then
    if coalesce(current_setting('app.service_reports_status_change', true), '') <> '1' then
      raise exception '리포트 상태 변경은 전용 RPC로만 가능합니다';
    end if;
    if old.status = 'draft' and new.status = 'issued' then
      v_check := false;
      new.pdf_revision := old.pdf_revision + 1;
      new.pdf_url := null;
      -- 작성자가 draft에 직접 UPDATE로 승인·완료·세금·무효 필드를 미리 채워 두는 경로 차단(BEFORE INSERT와 동일 초기화)
      new.approved_at := null; new.approved_by := null;
      new.approver_name := null; new.approver_title := null; new.approver_stamp_path := null;
      new.completed_at := null; new.completed_by := null;
      new.tax_invoice_status := null; new.tax_invoice_date := null; new.tax_invoice_memo := null;
      new.voided_at := null; new.voided_by := null; new.void_reason := null;
    elsif old.status = 'issued' and new.status = 'approved' then
      if new.approved_by is null or new.approved_at is null then
        raise exception '승인자(approved_by)·승인 일시가 필요합니다';
      end if;
      new.pdf_revision := old.pdf_revision + 1;
      new.pdf_url := null;   -- 승인본 PDF(직인 포함)는 워커가 새 세대로 재생성
      v_allowed := v_common || array['status', 'approved_at', 'approved_by', 'approver_name', 'approver_title', 'approver_stamp_path', 'pdf_revision'];
    elsif old.status = 'approved' and new.status = 'completed' then
      if new.tax_invoice_status is null or new.completed_by is null or new.completed_at is null then
        raise exception '세금계산서 상태·완료자·완료 일시가 필요합니다';
      end if;
      v_allowed := v_common || array['status', 'completed_at', 'completed_by', 'tax_invoice_status', 'tax_invoice_date', 'tax_invoice_memo'];
    elsif old.status in ('issued', 'approved') and new.status = 'voided' then
      if new.void_reason is null or btrim(new.void_reason) = '' then
        raise exception '무효화 사유(void_reason)가 필요합니다';
      end if;
      new.voided_at := now();
      v_allowed := v_common || array['status', 'void_reason', 'voided_at', 'voided_by'];
    elsif old.status = 'completed' and new.status = 'voided' then
      raise exception '완료된 리포트는 무효화할 수 없습니다';
    else
      raise exception '허용되지 않는 상태 전환입니다(% → %)', old.status, new.status;
    end if;
  elsif old.status in ('issued', 'approved', 'completed') then
    v_allowed := v_common;
  else
    v_check := false;   -- draft 동일 상태: 자유 편집
  end if;

  if v_check and (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception '발행된 리포트는 수정할 수 없습니다(무효화 또는 새 리포트로 정정)';
  end if;

  -- pdf_url은 발행 이후 워커(service_role)만 기록한다. RLS UPDATE(작성자 본인)로 REST에서 직접 바꾸면
  -- 승인·완료 전제(pdf_url 존재)를 우회하거나 타 문서 경로를 연결할 수 있으므로 역할과 경로 형식을 함께 강제.
  if old.status in ('issued', 'approved', 'completed') and new.pdf_url is distinct from old.pdf_url then
    if not (coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin')) then
      raise exception 'PDF 경로는 워커만 기록할 수 있습니다';
    end if;
    if new.pdf_url is not null and new.pdf_url !~ ('^' || new.id::text || '/report(-r[0-9]+)?\.pdf$') then
      raise exception 'PDF 경로가 올바르지 않습니다: %', new.pdf_url;
    end if;
  end if;
  return new;
end; $$;

-- 3. PDF enqueue — issued/approved 진입 시. 같은 리포트의 queued 잡이 이미 있으면(유니크 충돌) payload를 최신 세대로 갱신.
--    processing 중인 잡은 건드리지 않고 새 queued 잡을 추가 — 워커가 세대 불일치를 폐기하므로 안전.
create or replace function public.service_reports_enqueue_pdf()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_payload jsonb;
begin
  if new.status in ('issued', 'approved') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    v_payload := jsonb_build_object('service_report_id', new.id, 'revision', new.pdf_revision, 'expected_status', new.status);
    begin
      insert into public.jobs (type, payload) values ('service_report_pdf', v_payload);
    exception when unique_violation then
      update public.jobs set payload = v_payload, updated_at = now()
        where type = 'service_report_pdf' and status = 'queued'
          and payload ->> 'service_report_id' = new.id::text;
    end;
  end if;
  return null;
end; $$;
-- 트리거 service_reports_enqueue_pdf_trg(after insert or update)는 기존 정의 유지 — 함수 본문만 교체.

-- 4. 승인 요청 알림(UC4) — issued 진입 시 initial + reminder(+3일)를 같은 tx에서 예약(레이스 없음, D-C24).
--    approved/voided 진입 시 queued 알림 삭제(승인됐거나 무효화된 문서는 더 부르지 않는다).
create or replace function public.service_reports_enqueue_approval_notice()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'issued' and old.status is distinct from 'issued' then
    begin
      insert into public.jobs (type, payload)
      values ('service_report_approval_notice',
              jsonb_build_object('service_report_id', new.id, 'kind', 'initial', 'revision', new.pdf_revision));
    exception when unique_violation then null; end;
    begin
      insert into public.jobs (type, payload, run_after)
      values ('service_report_approval_notice',
              jsonb_build_object('service_report_id', new.id, 'kind', 'reminder', 'revision', new.pdf_revision),
              now() + interval '3 days');
    exception when unique_violation then null; end;
  elsif new.status in ('approved', 'voided') and old.status is distinct from new.status then
    delete from public.jobs
      where type = 'service_report_approval_notice' and status = 'queued'
        and payload ->> 'service_report_id' = new.id::text;
  end if;
  return null;
end; $$;
drop trigger if exists service_reports_enqueue_approval_notice_trg on public.service_reports;
create trigger service_reports_enqueue_approval_notice_trg
  after update on public.service_reports
  for each row execute function public.service_reports_enqueue_approval_notice();

-- 5. 고객 메일 자동 발송 제거(UC1: 승인본만 수동 버튼으로 발송)
drop trigger if exists service_reports_enqueue_email_trg on public.service_reports;
drop function if exists public.service_reports_enqueue_email();
