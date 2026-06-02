-- M2 P-E #23 — supply_requests(소모품신청) + supply_request_items + 전역 seq 채번 + assignee 트리거 + terminal 잠금 + RLS.
-- 등록고객 전용(company_id NOT NULL): anon 직접 INSERT 금지(제출은 submit_supply_request RPC만). 담당영업으로 row-scope,
-- 미배정(assignee NULL)은 supply_requests.view_all만 열람. 서버통제값(seq_no·created_at·company_id·assignee)은 BEFORE 트리거로 불변/강제.
-- items: 부모 SELECT 권한 따라감(EXISTS), 직접 write 전면 차단(변경은 RPC/service_role만). id 보존 diff-upsert는 향후 admin 편집 시 재사용.

create sequence public.supply_request_seq;

-- 채번: SUP-YYYYMMDD-NNNNN. KST 날짜 + 전역 누적(날짜 리셋 없음). 10만 초과 시 자릿수 증가(lpad 잘림 회피, P-D 패턴).
create or replace function public.next_supply_request_seq_no()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v bigint := nextval('public.supply_request_seq');
begin
  return 'SUP-'
    || to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDD')
    || '-'
    || case when v >= 100000 then v::text else lpad(v::text, 5, '0') end;
end;
$$;
-- 채번 함수는 트리거(INSERT 시 owner 컨텍스트)만 내부 호출 → 직접 호출 봉쇄(grant 함정 회피).
revoke execute on function public.next_supply_request_seq_no() from public, anon, authenticated;

create table public.supply_requests (
  id uuid primary key default gen_random_uuid(),
  seq_no text unique not null,                                  -- 트리거 강제(클라 지정 무시)
  company_id uuid not null references public.companies (id),    -- 등록고객 전용(미등록은 제출 차단)
  assignee_id uuid references public.profiles (id),             -- 트리거가 company.assignee_id서 채움; NULL=미배정 풀(view_all만)
  requester_name text not null,                                 -- 신청자(개인) — 콜백 검증(신원모델 A)
  requester_phone text not null,
  status text not null default 'received'
    check (status in ('received', 'in_progress', 'on_hold', 'done', 'canceled')),
  privacy_consent boolean not null,
  privacy_consent_at timestamptz not null,
  privacy_consent_version text not null,
  note text,                                                    -- 요청 메모(선택)
  admin_read_at timestamptz,                                    -- NULL = 미열람(경량 알림 배지)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supply_requests_requester_name_len check (char_length(requester_name) <= 100),
  constraint supply_requests_requester_phone_len check (char_length(requester_phone) <= 50),
  constraint supply_requests_note_len check (note is null or char_length(note) <= 2000)
);
create index supply_requests_assignee_idx on public.supply_requests (assignee_id);
create index supply_requests_status_idx on public.supply_requests (status);
create index supply_requests_created_idx on public.supply_requests (created_at desc);
create index supply_requests_company_idx on public.supply_requests (company_id);
create index supply_requests_unread_idx on public.supply_requests (admin_read_at);

create table public.supply_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.supply_requests (id) on delete cascade,
  consumable_id uuid not null references public.consumables (id),  -- 기본 NO ACTION(=restrict): 이력 보존(소모품 hard delete 금지, inactive soft만)
  consumable_name_snapshot text not null,                          -- 카탈로그 변경/삭제 후에도 신청 이력 보존
  consumable_unit_snapshot text,
  qty integer not null check (qty between 1 and 9999),             -- anon 대량/장난 주문 상한
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, consumable_id)                               -- 같은 소모품 중복 라인 차단(수량으로 합산)
);
create index supply_request_items_request_idx on public.supply_request_items (request_id);

-- 서버통제값 강제 + assignee 채움 + terminal 잠금.
-- INSERT: seq_no·created_at·updated_at 서버생성, assignee_id를 company.assignee_id로 채움.
-- UPDATE: seq_no·created_at·company_id 보존(불변), updated_at=now. done/canceled(종결)에서 상태 변경 금지(역행 차단).
create or replace function public.supply_requests_enforce_server_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.seq_no := public.next_supply_request_seq_no();
    new.created_at := now();
    new.updated_at := now();
    new.assignee_id := (select assignee_id from public.companies where id = new.company_id);
  elsif tg_op = 'UPDATE' then
    new.seq_no := old.seq_no;
    new.created_at := old.created_at;
    new.company_id := old.company_id;
    new.updated_at := now();
    if old.status in ('done', 'canceled') and new.status is distinct from old.status then
      raise exception '종결된 소모품신청(%): 상태를 변경할 수 없습니다', old.status using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger supply_requests_server_fields
  before insert or update on public.supply_requests
  for each row execute function public.supply_requests_enforce_server_fields();

-- items created_at·updated_at 서버 강제(클라 조작 불가, consumables 패턴).
create or replace function public.supply_request_items_enforce_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.created_at := now(); new.updated_at := now();
  elsif tg_op = 'UPDATE' then new.created_at := old.created_at; new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger supply_request_items_server_fields
  before insert or update on public.supply_request_items
  for each row execute function public.supply_request_items_enforce_server_fields();

alter table public.supply_requests enable row level security;
alter table public.supply_request_items enable row level security;

-- supply_requests: anon INSERT 정책 없음 → anon/authenticated 직접 INSERT 거부(제출은 SECURITY DEFINER RPC만).
-- SELECT: 자기 배정 건 OR supply_requests.view_all. (assignee NULL 행은 view_all만 매칭.)
create policy supply_requests_select on public.supply_requests
  for select to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'supply_requests.view_all'))
  );

create policy supply_requests_update on public.supply_requests
  for update to authenticated
  using (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'supply_requests.manage'))
  )
  with check (
    assignee_id = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'supply_requests.manage'))
  );

create policy supply_requests_delete on public.supply_requests
  for delete to authenticated
  using ((select public.has_permission((select auth.uid()), 'users.manage')));

-- supply_request_items: SELECT만 정책(부모 request의 SELECT 권한 EXISTS). INSERT/UPDATE/DELETE 정책 없음
-- → anon·authenticated 직접 write 전면 차단(변경은 RPC/service_role만). [M12]
create policy supply_request_items_select on public.supply_request_items
  for select to authenticated
  using (
    exists (
      select 1 from public.supply_requests sr
      where sr.id = supply_request_items.request_id
        and (
          sr.assignee_id = (select auth.uid())
          or (select public.has_permission((select auth.uid()), 'supply_requests.view_all'))
        )
    )
  );
