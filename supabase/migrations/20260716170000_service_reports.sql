-- 서비스 리포트(현장 A/S 결과 보고서) — 이슈 #228 Part 1.
-- release_orders 패턴 4회째 재사용: 전역 시퀀스 채번(KST·비잘림) + BEFORE 트리거 서버값 강제 +
-- 발행본 동결 + capability RLS + 비공개 버킷. 발행(issued) 후에는 문서 내용 수정 불가,
-- 예외 = pdf_url(워커)·follow_resolved_at/by(후속 처리)·voided 전환(무효화, 관리자).

-- 0. 채번 — service_requests 템플릿(10만 이상 비잘림) 복제. release_orders의 lpad 잘림 버그 미복제.
create sequence if not exists public.service_report_seq;

create or replace function public.next_service_report_seq_no()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v bigint := nextval('public.service_report_seq');
begin
  return 'SR-'
    || to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDD')
    || '-'
    || case when v >= 100000 then v::text else lpad(v::text, 5, '0') end;
end;
$$;
-- 채번 함수는 BEFORE INSERT 트리거만 내부 호출 — 직접 호출 봉쇄(시퀀스 임의 증가 방지).
revoke execute on function public.next_service_report_seq_no() from public, anon, authenticated;

-- 1. 테이블
create table public.service_reports (
  id uuid primary key default gen_random_uuid(),
  seq_no text unique not null,                                   -- 트리거 강제(클라 지정 무시)
  -- 연결(전부 nullable — 수기 작성·직접입력 고객/장비는 확정 시 서버가 행 생성 후 연결)
  service_request_id uuid references public.service_requests (id) on delete set null,
  company_id uuid references public.companies (id) on delete restrict,
  company_equipment_id uuid references public.company_equipment (id) on delete restrict,
  -- 고객 스냅샷(발행 시점 고정 — 이후 고객 DB가 바뀌어도 문서 불변)
  customer_name text not null default '' check (char_length(customer_name) <= 200),
  customer_biz_no text check (customer_biz_no ~ '^[0-9]{10}$'),
  customer_tel text check (char_length(coalesce(customer_tel, '')) <= 30),
  customer_addr text check (char_length(coalesce(customer_addr, '')) <= 500),
  recipient_email text check (char_length(coalesce(recipient_email, '')) <= 200),
  -- 장비 스냅샷(+보증 판정 근거 purchased_at)
  device_name text not null default '' check (char_length(device_name) <= 200),
  device_serial text check (char_length(coalesce(device_serial, '')) <= 100),
  purchased_at date,
  -- 엔지니어 스냅샷(확정 시 profiles에서 서버가 채움 — PDF '고객확인' 서명 셀 텍스트 렌더용)
  engineer_name text check (char_length(coalesce(engineer_name, '')) <= 60),
  engineer_title text check (char_length(coalesce(engineer_title, '')) <= 50),
  sender_hiworks_user_id text check (char_length(coalesce(sender_hiworks_user_id, '')) <= 100),
  -- 내용
  faults text[] not null default '{}' check (cardinality(faults) <= 20),
  diagnosis text not null default '' check (char_length(diagnosis) <= 4000),
  action_text text not null default '' check (char_length(action_text) <= 4000),
  photos_before text[] not null default '{}' check (cardinality(photos_before) <= 6),
  photos_after text[] not null default '{}' check (cardinality(photos_after) <= 6),
  -- 향후 일정(수기 리포트도 admin이 처리 완료 표시 가능해야 하므로 resolved는 동결 예외)
  follow_needed boolean not null default false,
  follow_memo text check (char_length(coalesce(follow_memo, '')) <= 500),
  follow_date date,
  follow_resolved_at timestamptz,
  follow_resolved_by uuid references public.profiles (id),
  -- 부품·청구(금액은 RPC가 서버 재계산 — 클라 값 미신뢰. VAT=round, 견적 엔진과 동일 규칙)
  parts jsonb not null default '[]',
  charge_type text not null default 'paid' check (charge_type in ('paid', 'free')),
  free_reason text check (free_reason in ('보증기간 내', '재방문 (동일 증상)', '영업 판단', '계약 포함')),
  visit_fee integer not null default 0 check (visit_fee between 0 and 100000000),
  overtime_fee integer not null default 0 check (overtime_fee between 0 and 100000000),
  parts_total integer not null default 0 check (parts_total >= 0),
  vat integer not null default 0 check (vat >= 0),
  total integer not null default 0 check (total >= 0),
  -- 서명·상태
  signature_path text check (char_length(coalesce(signature_path, '')) <= 300),
  status text not null default 'draft' check (status in ('draft', 'issued', 'voided')),
  void_reason text check (char_length(coalesce(void_reason, '')) <= 500),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  pdf_url text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  issued_at timestamptz
);

create index on public.service_reports (company_id);
create index on public.service_reports (service_request_id);
create index on public.service_reports (created_by);
-- 장비 A/S 이력 카드(같은 장비의 과거 issued 리포트) 조회용
create index on public.service_reports (company_equipment_id, status);
-- admin '후속조치 대기' 필터(미해소 후속만)
create index service_reports_follow_open on public.service_reports (follow_date)
  where follow_needed and follow_resolved_at is null and status = 'issued';

-- 2. BEFORE INSERT — 서버 통제값 강제(seq_no·created_at·created_by·발행 관련 필드 초기화)
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
  new.voided_at := null; new.voided_by := null; new.void_reason := null;
  new.follow_resolved_at := null; new.follow_resolved_by := null;
  return new;
end; $$;
create trigger service_reports_bi before insert on public.service_reports
  for each row execute function public.service_reports_before_insert();

-- 3. BEFORE UPDATE — 동결 규칙.
--   상시: seq_no·created_at·created_by 불변.
--   issued: 허용 예외 = pdf_url(워커) / follow_resolved_at·by(후속 처리) /
--           voided 전환(status+void_reason+voided_at·by 동시 — RPC가 사유 검증). 그 외 전부 동결.
--   voided: 종단 — 아무것도 수정 불가.
create or replace function public.service_reports_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.seq_no := old.seq_no;
  new.created_at := old.created_at;
  new.created_by := old.created_by;

  if old.status = 'voided' then
    raise exception '무효화된 리포트는 수정할 수 없습니다';
  end if;

  if old.status = 'issued' then
    if new.status = 'voided' then
      -- 무효화 전환: void 필드 외 내용 변경 동반 금지
      new.voided_at := now();
      if new.void_reason is null or btrim(new.void_reason) = '' then
        raise exception '무효화 사유(void_reason)가 필요합니다';
      end if;
    elsif new.status is distinct from old.status then
      raise exception '발행된 리포트는 draft로 되돌릴 수 없습니다';
    end if;

    if new.service_request_id is distinct from old.service_request_id
       or new.company_id is distinct from old.company_id
       or new.company_equipment_id is distinct from old.company_equipment_id
       or new.customer_name is distinct from old.customer_name
       or new.customer_biz_no is distinct from old.customer_biz_no
       or new.customer_tel is distinct from old.customer_tel
       or new.customer_addr is distinct from old.customer_addr
       or new.recipient_email is distinct from old.recipient_email
       or new.device_name is distinct from old.device_name
       or new.device_serial is distinct from old.device_serial
       or new.purchased_at is distinct from old.purchased_at
       or new.engineer_name is distinct from old.engineer_name
       or new.engineer_title is distinct from old.engineer_title
       or new.sender_hiworks_user_id is distinct from old.sender_hiworks_user_id
       or new.faults is distinct from old.faults
       or new.diagnosis is distinct from old.diagnosis
       or new.action_text is distinct from old.action_text
       or new.photos_before is distinct from old.photos_before
       or new.photos_after is distinct from old.photos_after
       or new.follow_needed is distinct from old.follow_needed
       or new.follow_memo is distinct from old.follow_memo
       or new.follow_date is distinct from old.follow_date
       or new.parts is distinct from old.parts
       or new.charge_type is distinct from old.charge_type
       or new.free_reason is distinct from old.free_reason
       or new.visit_fee is distinct from old.visit_fee
       or new.overtime_fee is distinct from old.overtime_fee
       or new.parts_total is distinct from old.parts_total
       or new.vat is distinct from old.vat
       or new.total is distinct from old.total
       or new.signature_path is distinct from old.signature_path
       or new.issued_at is distinct from old.issued_at then
      raise exception '발행된 리포트는 수정할 수 없습니다(무효화 또는 새 리포트로 정정)';
    end if;
  end if;

  return new;
end; $$;
create trigger service_reports_bu before update on public.service_reports
  for each row execute function public.service_reports_before_update();

-- 4. RLS
alter table public.service_reports enable row level security;

-- SELECT: 본인 작성 전부 / 발행·무효본은 write 보유자 전원(장비 이력 카드 성립) / view_all 전체.
create policy service_reports_select on public.service_reports
  for select to authenticated using (
    created_by = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'service_reports.view_all'))
    or (
      status in ('issued', 'voided')
      and (select public.has_permission((select auth.uid()), 'service_reports.write'))
    )
  );

-- INSERT/UPDATE: 쓰기 권한 + 본인 행(발행·무효화·후속처리는 SECURITY DEFINER RPC가 별도 수행).
create policy service_reports_insert on public.service_reports
  for insert to authenticated with check (
    (select public.has_permission((select auth.uid()), 'service_reports.write'))
    and created_by = (select auth.uid())
  );
create policy service_reports_update on public.service_reports
  for update to authenticated using (
    (select public.has_permission((select auth.uid()), 'service_reports.write'))
    and created_by = (select auth.uid())
  );
create policy service_reports_delete on public.service_reports
  for delete to authenticated using (
    (select public.has_permission((select auth.uid()), 'users.manage'))
  );

-- 5. 스토리지 — 비공개 버킷(사진·서명·PDF). 경로는 버킷-상대 `<report_uuid>/...`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-reports', 'service-reports', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  on conflict (id) do nothing;

-- INSERT: 쓰기 권한 + 경로 정규식 + 본인 소유 draft 리포트 폴더만(타 리포트/발행본 폴더 차단).
create policy service_reports_objects_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'service-reports'
    and (
      name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(before|after)-[1-6]\.(jpg|jpeg|png|webp)$'
      or name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/signature\.png$'
    )
    and exists (
      select 1 from public.service_reports r
      where r.id::text = split_part(name, '/', 1)
        and r.created_by = (select auth.uid())
        and r.status = 'draft'
    )
    and (select public.has_permission((select auth.uid()), 'service_reports.write'))
  );

-- SELECT: 쓰기 또는 전체조회 권한(서명URL 발급·PDF/사진 열람). 워커는 service_role 우회.
create policy service_reports_objects_read on storage.objects
  for select to authenticated using (
    bucket_id = 'service-reports'
    and ((select public.has_permission((select auth.uid()), 'service_reports.write'))
         or (select public.has_permission((select auth.uid()), 'service_reports.view_all')))
  );

-- DELETE: 본인 소유 draft 폴더의 객체만(잘못 찍은 사진 삭제·재서명). 발행 후 삭제 불가.
create policy service_reports_objects_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'service-reports'
    and exists (
      select 1 from public.service_reports r
      where r.id::text = split_part(name, '/', 1)
        and r.created_by = (select auth.uid())
        and r.status = 'draft'
    )
    and (select public.has_permission((select auth.uid()), 'service_reports.write'))
  );
