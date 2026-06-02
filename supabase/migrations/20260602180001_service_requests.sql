-- M2 P-D #22 — service_requests(A/S신청) + 전역 seq 채번 + assignee 트리거 + terminal 잠금 + RLS.
-- 신원모델 A: anon 직접 INSERT 금지(제출은 submit_service_request RPC만). 등록고객(company_id)은 담당영업으로
-- row-scope, 미등록(NULL)·미배정(assignee NULL)은 service_requests.view_all만 열람.
-- 서버통제값(seq_no·created_at·biz_no·assignee)은 BEFORE 트리거로 불변/강제(applications 패턴 재사용).

create sequence public.service_request_seq;

-- 채번: AS-YYYYMMDD-NNNNN. KST 날짜 + 전역 누적(날짜 리셋 없음). 10만 초과 시 자릿수 증가(lpad 잘림 회피).
create or replace function public.next_service_request_seq_no()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v bigint := nextval('public.service_request_seq');
begin
  return 'AS-'
    || to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDD')
    || '-'
    || case when v >= 100000 then v::text else lpad(v::text, 5, '0') end;
end;
$$;

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  seq_no text unique not null,                                  -- 트리거 강제(클라 지정 무시)
  biz_no text not null,                                         -- 제출 사업자번호(미등록도 보관). 형식 CHECK.
  company_id uuid references public.companies (id),             -- NULL = 미등록(미확인) 접수
  company_equipment_id uuid references public.company_equipment (id) on delete restrict,  -- 등록경로만
  assignee_id uuid references public.profiles (id),             -- 트리거가 company.assignee_id서 채움; NULL=미배정 풀
  contact_company text not null,                                -- 연락처 스냅샷(CRM 마스터 불변)
  contact_ceo text,
  contact_phone text,
  contact_email text,
  contact_address text,
  status text not null default 'received'
    check (status in ('received', 'in_progress', 'on_hold', 'done', 'canceled')),
  privacy_consent boolean not null,
  privacy_consent_at timestamptz not null,
  privacy_consent_version text not null,
  fields jsonb not null default '{}',                           -- { symptom, preferred_date, equipment_text, photos }
  admin_read_at timestamptz,                                    -- NULL = 미열람(경량 알림 배지)
  created_at timestamptz not null default now(),
  constraint service_requests_biz_no_format check (biz_no ~ '^\d{10}$'),
  constraint service_requests_contact_company_len check (char_length(contact_company) <= 200),
  constraint service_requests_fields_size check (octet_length(fields::text) <= 8192)
);
create index service_requests_assignee_idx on public.service_requests (assignee_id);
create index service_requests_status_idx on public.service_requests (status);
create index service_requests_created_idx on public.service_requests (created_at desc);
create index service_requests_company_idx on public.service_requests (company_id);
create index service_requests_unread_idx on public.service_requests (admin_read_at);

-- 서버통제값 강제 + assignee 채움 + terminal 잠금.
-- INSERT: seq_no·created_at 서버생성, company_id 있으면 assignee_id를 company.assignee_id로 채움.
-- UPDATE: seq_no·created_at·biz_no 보존(불변). done/canceled(종결)에서 상태 변경 금지(역행 차단).
create or replace function public.service_requests_enforce_server_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.seq_no := public.next_service_request_seq_no();
    new.created_at := now();
    if new.company_id is not null then
      new.assignee_id := (select assignee_id from public.companies where id = new.company_id);
    end if;
  elsif tg_op = 'UPDATE' then
    new.seq_no := old.seq_no;
    new.created_at := old.created_at;
    new.biz_no := old.biz_no;
    if old.status in ('done', 'canceled') and new.status is distinct from old.status then
      raise exception '종결된 A/S(%): 상태를 변경할 수 없습니다', old.status using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger service_requests_server_fields
  before insert or update on public.service_requests
  for each row execute function public.service_requests_enforce_server_fields();

alter table public.service_requests enable row level security;

-- anon INSERT 정책 없음 → anon 직접 INSERT 거부(제출은 SECURITY DEFINER RPC만).
-- 로그인 사용자: 자기 배정 건 OR service_requests.view_all. (assignee NULL 행은 view_all만 매칭.)
create policy service_requests_select on public.service_requests
  for select to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'service_requests.view_all'))
  );

-- 수정: 자기 배정 건 OR service_requests.manage.
create policy service_requests_update on public.service_requests
  for update to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'service_requests.manage'))
  )
  with check (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'service_requests.manage'))
  );

create policy service_requests_delete on public.service_requests
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'users.manage')));
