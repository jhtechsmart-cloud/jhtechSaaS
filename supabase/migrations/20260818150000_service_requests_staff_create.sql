-- #281 A/S 대행 접수(직원 전용) — 영업담당이 전화로 받은 A/S를 콘솔에서 고객사 검색으로 직접 접수.
-- ① service_requests 컬럼: channel(web/phone/visit/other)·created_by(접수 직원)·privacy_consent_method(web/verbal)·submission_id(멱등키)
-- ② biz_no NOT NULL 해제(직원 접수는 사업자번호 없는 고객도 허용) + 조건부 CHECK(웹 접수는 biz_no 필수)
-- ③ 트리거 UPDATE 분기: 새 감사 컬럼 동결(biz_no와 동일)
-- ④ RLS select: 접수자(created_by)도 자기 접수 건 열람
-- ⑤ 스토리지: 직원 사진 INSERT 정책(create 권한+슬롯 정규식) + 읽기 = 자기 배정/접수 건 사진만(EXISTS, 버킷 전체 개방 금지)
-- ⑥ RPC create_service_request_by_staff(payload) SECURITY DEFINER — 권한·고객 스코프(companies RLS와 동일 조건)·값 강제·멱등
-- ⑦ 기존 영업 계정 권한 백필: service_requests.claim 보유자에게 service_requests.create 부여(조건부, 알림 카운트)
-- 담당자 배정은 웹 접수와 동일(트리거가 고객사 담당영업 채움) — INSERT 분기 무변경. /autoplan 최종 게이트 결정 B.
-- 롤백: supabase/rollback/20260818150000_service_requests_staff_create_down.sql

-- ── ① 컬럼 ──
alter table public.service_requests
  add column if not exists channel text not null default 'web'
    constraint service_requests_channel_check check (channel in ('web', 'phone', 'visit', 'other')),
  add column if not exists created_by uuid references public.profiles (id) on delete set null,
  add column if not exists privacy_consent_method text not null default 'web'
    constraint service_requests_consent_method_check check (privacy_consent_method in ('web', 'verbal')),
  add column if not exists submission_id uuid;

create unique index if not exists service_requests_submission_id_unique
  on public.service_requests (submission_id) where submission_id is not null;
create index if not exists service_requests_created_by_idx on public.service_requests (created_by);

comment on column public.service_requests.channel is '접수 경로: web(공개 폼) / phone·visit·other(직원 대행 접수)';
comment on column public.service_requests.created_by is '대행 접수한 직원(profiles.id). 웹 접수 = null';
comment on column public.service_requests.privacy_consent_method is '개인정보 동의 방식: web(고객 직접 체크) / verbal(직원이 구두 안내·확인)';
comment on column public.service_requests.submission_id is '직원 접수 멱등 키(사진 경로 prefix uuid). 동일 키 재호출은 기존 행 반환';

-- ── ② biz_no 조건부 필수 ──
alter table public.service_requests alter column biz_no drop not null;
alter table public.service_requests
  add constraint service_requests_biz_no_required_for_web
    check (channel <> 'web' or biz_no is not null);
-- 직원 접수는 등록 고객(company_id)·접수자(created_by) 필수.
alter table public.service_requests
  add constraint service_requests_staff_channel_check
    check (channel = 'web' or (company_id is not null and created_by is not null));

-- ── ③ 트리거: 감사 컬럼 동결(UPDATE) — INSERT 분기(seq_no·created_at·assignee 채움)는 원문 유지 ──
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
    -- #281 대행 접수 감사 컬럼 불변(배정자는 본인 행 전 컬럼 UPDATE 가능하므로 트리거로 잠근다)
    new.channel := old.channel;
    new.created_by := old.created_by;
    new.privacy_consent_method := old.privacy_consent_method;
    new.submission_id := old.submission_id;
    if old.status in ('done', 'canceled') and new.status is distinct from old.status then
      raise exception '종결된 A/S(%): 상태를 변경할 수 없습니다', old.status using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- ── ④ RLS select: 접수자도 자기 접수 건 열람(편집권 없음 — UPDATE 정책 불변) ──
drop policy if exists service_requests_select on public.service_requests;
create policy service_requests_select on public.service_requests
  for select to authenticated
  using (
    assignee_id = (select auth.uid())
    or created_by = (select auth.uid())
    or (select public.has_permission((select auth.uid()), 'service_requests.view_all'))
    or (assignee_id is null and (select public.has_permission((select auth.uid()), 'service_requests.claim')))
  );

-- ── ⑤ 스토리지 ──
-- 직원 사진 업로드: create 권한 + anon과 동일 슬롯 정규식.
create policy "customer_uploads_insert_staff_as" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'customer-uploads'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(as_photo_1|as_photo_2|as_photo_3)\.(jpg|png|webp)$'
    and (select public.has_permission((select auth.uid()), 'service_requests.create'))
  );
-- 읽기: 기존 view_all 전체 읽기 + "자기 배정/접수 A/S 건에 연결된 사진"만 추가(AS 슬롯 한정, 버킷 전체 개방 금지).
drop policy if exists "customer_uploads_read_staff_as" on storage.objects;
create policy "customer_uploads_read_staff_as" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'customer-uploads'
    and (
      (select public.has_permission((select auth.uid()), 'service_requests.view_all'))
      or (
        name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(as_photo_1|as_photo_2|as_photo_3)\.(jpg|png|webp)$'
        and exists (
          select 1
          from public.service_requests r
          cross join jsonb_each_text(coalesce(r.fields->'photos', '{}'::jsonb)) p
          where p.value = storage.objects.name
            and (r.assignee_id = (select auth.uid()) or r.created_by = (select auth.uid()))
        )
      )
    )
  );

-- ── ⑥ RPC ──
create or replace function public.create_service_request_by_staff(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_company_raw text := nullif(btrim(payload->>'company_id'), '');
  v_company_id uuid;
  v_co record;
  v_ce_raw text := nullif(payload->>'company_equipment_id', '');
  v_ce_id uuid;
  v_channel text := nullif(btrim(payload->>'channel'), '');
  v_consent_type text := jsonb_typeof(payload->'privacy_consent');
  v_consent_ver text := nullif(btrim(payload->>'privacy_consent_version'), '');
  v_sub_raw text := nullif(btrim(payload->>'submission_id'), '');
  v_sub_id uuid;
  v_fields jsonb := coalesce(payload->'fields', '{}'::jsonb);
  v_symptom text := nullif(btrim(v_fields->>'symptom'), '');
  v_pref text := nullif(btrim(v_fields->>'preferred_date'), '');
  v_contact_name text := nullif(btrim(v_fields->>'contact_name'), '');
  v_callback text := nullif(btrim(v_fields->>'callback_phone'), '');
  v_photos jsonb := coalesce(v_fields->'photos', '{}'::jsonb);
  v_slot text;
  v_path text;
  v_clean_fields jsonb;
  v_existing record;
  v_id uuid;
  v_seq text;
begin
  -- 권한: 로그인 + service_requests.create(비활성 계정은 has_permission이 거부).
  if v_uid is null or not public.has_permission(v_uid, 'service_requests.create') then
    raise exception '권한이 없습니다';
  end if;

  -- 고객: 필수·실존 + companies RLS와 동일 스코프(본인 담당 OR customers.view_all). DEFINER가 RLS를 우회하므로 명시 검사.
  if v_company_raw is null or v_company_raw !~* v_uuid_re then
    raise exception '고객을 선택하세요';
  end if;
  v_company_id := v_company_raw::uuid;
  select id, name, biz_no, ceo, phone, email, address
    into v_co
    from public.companies
   where id = v_company_id
     and (assignee_id = v_uid or public.has_permission(v_uid, 'customers.view_all'))
   for share;
  if not found then
    raise exception '고객을 찾을 수 없습니다';
  end if;

  -- 보유장비(선택): 그 회사 소유만.
  if v_ce_raw is not null then
    if v_ce_raw !~* v_uuid_re then
      raise exception '유효하지 않은 장비입니다';
    end if;
    v_ce_id := v_ce_raw::uuid;
    if not exists (select 1 from public.company_equipment where id = v_ce_id and company_id = v_company_id) then
      raise exception '유효하지 않은 장비입니다';
    end if;
  end if;

  -- 접수 경로: 직원 채널만.
  if v_channel is null or v_channel not in ('phone', 'visit', 'other') then
    raise exception '접수 경로가 올바르지 않습니다';
  end if;

  -- 동의(구두 확인): JSON boolean true + 버전 실존.
  if v_consent_type is distinct from 'boolean' or (payload->'privacy_consent')::boolean is not true then
    raise exception '개인정보 수집·이용 동의가 필요합니다';
  end if;
  if v_consent_ver is null or not exists (select 1 from public.privacy_policies where version = v_consent_ver) then
    raise exception '유효하지 않은 동의 버전입니다';
  end if;

  -- 멱등 키(선택): uuid. 이미 같은 키로 접수됐으면 기존 행 반환(더블클릭·재시도).
  if v_sub_raw is not null then
    if v_sub_raw !~* v_uuid_re then
      raise exception '유효하지 않은 제출 식별자입니다';
    end if;
    v_sub_id := v_sub_raw::uuid;
    select id, seq_no into v_existing from public.service_requests where submission_id = v_sub_id;
    if found then
      return jsonb_build_object('id', v_existing.id, 'seq_no', v_existing.seq_no, 'duplicate', true);
    end if;
  end if;

  -- 증상 필수·길이, 희망일 형식, 통화자·회신번호 길이.
  if v_symptom is null then
    raise exception '증상 내용은 필수입니다';
  end if;
  if v_pref is not null and v_pref !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception '희망일 형식이 올바르지 않습니다';
  end if;
  if length(v_symptom) > 2000
     or coalesce(length(v_contact_name), 0) > 60
     or coalesce(length(v_callback), 0) > 30
     or octet_length(v_fields::text) > 8192 then
    raise exception '입력값이 허용 길이를 초과했습니다';
  end if;

  -- photos 슬롯 화이트리스트 + 경로 정규식(anon RPC 동일).
  for v_slot in select jsonb_object_keys(v_photos) loop
    if v_slot not in ('as_photo_1', 'as_photo_2', 'as_photo_3') then
      raise exception '허용되지 않은 사진 슬롯입니다';
    end if;
    v_path := v_photos->>v_slot;
    if v_path is not null and v_path !~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' || v_slot || '\.(jpg|png|webp)$') then
      raise exception '사진 경로 형식이 올바르지 않습니다';
    end if;
  end loop;

  -- fields 화이트리스트 재구성.
  v_clean_fields := jsonb_build_object('symptom', v_symptom, 'photos', v_photos);
  if v_pref is not null then v_clean_fields := v_clean_fields || jsonb_build_object('preferred_date', v_pref); end if;
  if v_contact_name is not null then v_clean_fields := v_clean_fields || jsonb_build_object('contact_name', v_contact_name); end if;
  if v_callback is not null then v_clean_fields := v_clean_fields || jsonb_build_object('callback_phone', v_callback); end if;

  -- INSERT: 연락처 스냅샷은 companies 행에서(클라 값 무시). assignee는 트리거가 고객사 담당영업으로 채움.
  begin
    insert into public.service_requests
      (biz_no, company_id, company_equipment_id, contact_company, contact_ceo, contact_phone, contact_email, contact_address,
       privacy_consent, privacy_consent_at, privacy_consent_version, privacy_consent_method,
       fields, status, channel, created_by, submission_id)
    values (
      v_co.biz_no, v_company_id, v_ce_id, v_co.name, v_co.ceo, v_co.phone, v_co.email, v_co.address,
      true, now(), v_consent_ver, 'verbal',
      v_clean_fields, 'received', v_channel, v_uid, v_sub_id
    )
    returning id, seq_no into v_id, v_seq;
  exception when unique_violation then
    -- 동시 더블 제출 레이스: 먼저 들어간 행 반환.
    select id, seq_no into v_existing from public.service_requests where submission_id = v_sub_id;
    if found then
      return jsonb_build_object('id', v_existing.id, 'seq_no', v_existing.seq_no, 'duplicate', true);
    end if;
    raise;
  end;

  return jsonb_build_object('id', v_id, 'seq_no', v_seq, 'duplicate', false);
end;
$$;
revoke all on function public.create_service_request_by_staff(jsonb) from public, anon;
grant execute on function public.create_service_request_by_staff(jsonb) to authenticated;

-- ── ⑦ 기존 영업 계정 권한 백필 ──
-- 판별식 = service_requests.claim 보유(미배정 A/S를 가져오는 계정 = 대행 접수 주체). 신규 키라 "의도적으로 뺀 계정"이 없다.
do $$
declare v_count int;
begin
  with updated as (
    update public.profiles
       set permissions = array_append(permissions, 'service_requests.create')
     where 'service_requests.claim' = any(permissions)
       and not ('service_requests.create' = any(permissions))
    returning 1
  )
  select count(*) into v_count from updated;
  raise notice '#281 service_requests.create 백필: % profile(s) updated', v_count;
end $$;
