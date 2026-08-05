-- #253 장비 → 홈페이지(워드프레스) 자동 등록 — M1: equipment 연동 컬럼 + 서버통제/enqueue 트리거 + RPC 2종.
-- 계약(autoplan 확정):
--   · wp_publish_enabled만 폼 수정 가능, 나머지 wp_*는 record_wp_sync RPC(tx-local 플래그) 경유만
--   · 공개(publish) 글 저장 = 잡 미생성 + wp_dirty만 set ([홈페이지 갱신] 버튼으로만 반영)
--   · 초안/미생성 저장 = sync 잡 자동 enqueue (jobs는 RLS 정책 0 → 트리거/DEFINER RPC만이 유일 경로)
--   · 활성 잡 장비당 1건 = 부분 유니크 인덱스 + unique_violation 흡수
--   · 최초 생성 레이스 = record_wp_sync의 wp_post_id CAS (advisory lock은 워커 HTTP 흐름에서 무효 — 사용 금지)

-- 1) M2 선행: 분류 → WP 카테고리 매핑(대분류·소분류 모두 설정 가능, 해석은 조상 폴백)
alter table public.equipment_category
  add column wp_category_id integer;

-- 조상 방향 첫 설정값 해석(소분류 우선). 순환 가드 포함. 트리거·웹 조회 공용.
create or replace function public.resolve_wp_category_id(p_category_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  with recursive chain as (
    select id, parent_id, wp_category_id, 1 as depth
    from public.equipment_category where id = p_category_id
    union all
    select ec.id, ec.parent_id, ec.wp_category_id, chain.depth + 1
    from public.equipment_category ec
    join chain on ec.id = chain.parent_id
    where chain.depth < 10 -- 순환·비정상 깊이 가드
  )
  select wp_category_id from chain where wp_category_id is not null order by depth limit 1;
$$;

-- 2) M1: equipment 연동 컬럼
alter table public.equipment
  add column wp_publish_enabled boolean not null default false,
  add column wp_post_id integer,
  add column wp_post_status text check (wp_post_status is null or wp_post_status in ('draft','publish')),
  add column wp_media jsonb not null default '{}', -- {storage_path: media_id} — 변경 감지·부분 교체·고아 정리
  add column wp_dirty boolean not null default false,
  add column wp_dirty_at timestamptz, -- dirty 해제 CAS 기준점(sync 중 재수정 보존)
  add column wp_last_error text,
  add column wp_synced_at timestamptz;

-- 3) 활성 잡 장비당 1건(부분 유니크). enqueue 측은 unique_violation 흡수.
create unique index jobs_wp_publish_active_uniq on public.jobs ((payload->>'equipment_id'))
  where type = 'wp_publish' and status in ('queued','processing');

-- 4) BEFORE 트리거 — 서버통제 강제 + wp_dirty 계산.
--    record_wp_sync만 tx-local 플래그(app.wp_sync)로 통제 컬럼을 쓴다(service_role도 직접 UPDATE는 옛값 유지).
create or replace function public.equipment_wp_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fields_changed boolean;
begin
  if tg_op = 'INSERT' then
    -- 위조 차단: 통제 컬럼은 어떤 입력이 와도 초기값으로
    new.wp_post_id := null;
    new.wp_post_status := null;
    new.wp_media := '{}'::jsonb;
    new.wp_dirty := false;
    new.wp_dirty_at := null;
    new.wp_last_error := null;
    new.wp_synced_at := null;
    return new;
  end if;

  -- record_wp_sync 내부 UPDATE = 통제 컬럼 자유(단일 진입점)
  if coalesce(current_setting('app.wp_sync', true), '') = '1' then
    return new;
  end if;

  -- 그 외 UPDATE: 통제 컬럼 옛값 유지
  new.wp_post_id := old.wp_post_id;
  new.wp_post_status := old.wp_post_status;
  new.wp_media := old.wp_media;
  new.wp_dirty := old.wp_dirty;
  new.wp_dirty_at := old.wp_dirty_at;
  new.wp_last_error := old.wp_last_error;
  new.wp_synced_at := old.wp_synced_at;

  -- WP 반영 필드 비교 → dirty 계산. 제외 방식이 아니라 반영 필드 열거:
  -- 본문을 구성하는 것만(name·model·photos·specs·highlights·youtube_urls·category_id).
  v_fields_changed :=
    new.name is distinct from old.name
    or new.model is distinct from old.model
    or new.photos is distinct from old.photos
    or new.specs is distinct from old.specs
    or new.highlights is distinct from old.highlights
    or new.youtube_urls is distinct from old.youtube_urls
    or new.category_id is distinct from old.category_id;

  if new.wp_publish_enabled and v_fields_changed then
    new.wp_dirty := true;
    -- clock_timestamp(): now()는 tx 내 상수라 같은 tx의 연속 수정이 같은 값 → CAS 무력화. 실시각으로.
    new.wp_dirty_at := clock_timestamp();
  end if;

  return new;
end;
$$;

create trigger equipment_wp_guard_trg
  before insert or update on public.equipment
  for each row execute function public.equipment_wp_guard();

-- 5) enqueue 헬퍼 — 활성 잡 유니크 위반은 무해(이미 대기 중) → 흡수.
-- SECURITY DEFINER 필수: jobs는 RLS 정책 0 + GRANT 0이라 소유자 권한으로만 INSERT 가능.
-- (⚠️ 로컬 Supabase 이미지에서 authenticated 실행 시 segfault 실측 — invoker 실행 금지)
create or replace function public.enqueue_wp_job(p_equipment_id uuid, p_action text, p_wp_post_id integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.jobs (type, payload)
    values ('wp_publish', jsonb_strip_nulls(jsonb_build_object(
      'equipment_id', p_equipment_id,
      'action', p_action,
      'wp_post_id', p_wp_post_id
    )));
  exception when unique_violation then
    null; -- 동일 장비 활성 잡 존재 — 중복 enqueue 무시
  end;
end;
$$;

-- 6) AFTER 트리거 — 저장 분기별 enqueue.
--    · sync: 체크 on + active + 매핑 해석 OK + (미생성 or 초안) + (체크 켬 or 반영 필드 변경)
--    · unpublish: 체크 off 전환 or inactive 전환, 글 존재 시. payload에 wp_post_id 동봉(행 삭제 후에도 처리 가능)
--    · record_wp_sync 발 UPDATE는 재발화 스킵(무한 루프 방지)
create or replace function public.equipment_wp_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields_changed boolean;
  v_enabled_on boolean;
begin
  if tg_op = 'DELETE' then
    if old.wp_post_id is not null then
      perform public.enqueue_wp_job(old.id, 'unpublish', old.wp_post_id);
    end if;
    return null;
  end if;

  if coalesce(current_setting('app.wp_sync', true), '') = '1' then
    return null;
  end if;

  v_enabled_on := new.wp_publish_enabled and not old.wp_publish_enabled;
  v_fields_changed :=
    new.name is distinct from old.name
    or new.model is distinct from old.model
    or new.photos is distinct from old.photos
    or new.specs is distinct from old.specs
    or new.highlights is distinct from old.highlights
    or new.youtube_urls is distinct from old.youtube_urls
    or new.category_id is distinct from old.category_id;

  -- 내리기: 체크 해제 or inactive 전환
  if old.wp_post_id is not null
     and ((old.wp_publish_enabled and not new.wp_publish_enabled)
          or (new.status = 'inactive' and old.status = 'active')) then
    perform public.enqueue_wp_job(new.id, 'unpublish', old.wp_post_id);
    return null;
  end if;

  -- 자동 sync: 공개 글은 제외(버튼으로만) — 미생성·초안만
  if new.wp_publish_enabled
     and new.status = 'active'
     and (new.wp_post_id is null or new.wp_post_status = 'draft')
     and (v_enabled_on or v_fields_changed)
     and public.resolve_wp_category_id(new.category_id) is not null then
    perform public.enqueue_wp_job(new.id, 'sync', null);
  end if;

  return null;
end;
$$;

create trigger equipment_wp_enqueue_trg
  after update or delete on public.equipment
  for each row execute function public.equipment_wp_enqueue();

-- 7) 버튼 경로 RPC — 발행/갱신/재시도. 권한(equipment.manage)+상태 검증을 서버가 강제.
create or replace function public.enqueue_wp_publish(p_equipment_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eq public.equipment;
begin
  if not (select public.has_permission((select auth.uid()), 'equipment.manage')) then
    raise exception '권한이 없습니다 (equipment.manage)';
  end if;
  if p_action not in ('publish','refresh','sync','unpublish') then
    raise exception '알 수 없는 동작: %', p_action;
  end if;

  select * into v_eq from public.equipment where id = p_equipment_id for update;
  if v_eq.id is null then
    raise exception '장비를 찾을 수 없습니다';
  end if;

  if p_action = 'publish' then
    if not v_eq.wp_publish_enabled then raise exception '홈페이지 등록이 체크되지 않은 장비입니다'; end if;
    if v_eq.status <> 'active' then raise exception '비활성 장비는 발행할 수 없습니다'; end if;
    if v_eq.wp_post_id is null then raise exception '초안이 아직 생성되지 않았습니다'; end if;
    if v_eq.wp_post_status = 'publish' then raise exception '이미 공개된 글입니다'; end if;
    perform public.enqueue_wp_job(v_eq.id, 'publish', v_eq.wp_post_id);
  elsif p_action = 'refresh' then
    if v_eq.wp_post_status is distinct from 'publish' then raise exception '공개된 글만 갱신할 수 있습니다'; end if;
    perform public.enqueue_wp_job(v_eq.id, 'sync', null);
  elsif p_action = 'sync' then
    if not v_eq.wp_publish_enabled then raise exception '홈페이지 등록이 체크되지 않은 장비입니다'; end if;
    if v_eq.wp_post_status = 'publish' then raise exception '공개된 글은 [홈페이지 갱신]을 사용하세요'; end if;
    if public.resolve_wp_category_id(v_eq.category_id) is null then raise exception '분류의 WP 카테고리 설정이 필요합니다'; end if;
    perform public.enqueue_wp_job(v_eq.id, 'sync', null);
  else -- unpublish
    if v_eq.wp_post_id is null then raise exception '홈페이지 글이 없습니다'; end if;
    perform public.enqueue_wp_job(v_eq.id, 'unpublish', v_eq.wp_post_id);
  end if;
end;
$$;
revoke all on function public.enqueue_wp_publish(uuid, text) from public, anon;
grant execute on function public.enqueue_wp_publish(uuid, text) to authenticated, service_role;

-- 8) 워커 기록 RPC — 통제 컬럼의 단일 진입점. service_role 전용.
--    CAS 2종: ① wp_post_id 최초 기록(레이스 패자 감지) ② dirty 해제(스냅샷 일치 시만 — sync 중 재수정 보존)
create or replace function public.record_wp_sync(
  p_equipment_id uuid,
  p_post_id integer,
  p_post_status text,
  p_media jsonb,
  p_last_error text,
  p_clear_error boolean,
  p_dirty_snapshot timestamptz,
  p_replace boolean default false -- 404 재연결/재생성: 기존과 다른 post_id 교체 허용(CAS 우회는 이 경로뿐)
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eq public.equipment;
  v_cas_won boolean := true;
begin
  select * into v_eq from public.equipment where id = p_equipment_id for update;
  if v_eq.id is null then
    return jsonb_build_object('cas_won', false, 'wp_post_id', null, 'missing', true);
  end if;

  -- ① post_id CAS: 이미 다른 글이 연결돼 있으면 이번 기록은 패배(호출측이 자기 draft 삭제).
  --    p_replace=true(404 재연결)만 교체 허용.
  if p_post_id is not null and not p_replace then
    if v_eq.wp_post_id is not null and v_eq.wp_post_id <> p_post_id then
      return jsonb_build_object('cas_won', false, 'wp_post_id', v_eq.wp_post_id);
    end if;
  end if;

  -- 플래그는 이 UPDATE 한 문장 동안만 유효(직후 해제) — tx-local이 트랜잭션 끝까지 살아
  -- 같은 tx의 후속 UPDATE에서 가드·enqueue 트리거가 통째로 꺼지는 결함 방지.
  perform set_config('app.wp_sync', '1', true);
  update public.equipment set
    wp_post_id = case when p_replace then p_post_id else coalesce(p_post_id, wp_post_id) end,
    wp_post_status = coalesce(p_post_status, wp_post_status),
    wp_media = coalesce(p_media, wp_media),
    wp_last_error = case when p_clear_error then null else coalesce(p_last_error, wp_last_error) end,
    wp_synced_at = case when p_post_id is not null or p_post_status is not null then now() else wp_synced_at end,
    -- ② dirty 해제 CAS: 워커가 읽은 시점 이후 재수정(dirty_at 변경)이 있으면 유지
    wp_dirty = case
      when wp_dirty and wp_dirty_at is not distinct from p_dirty_snapshot then false
      else wp_dirty
    end
  where id = p_equipment_id;
  perform set_config('app.wp_sync', '', true);

  return jsonb_build_object('cas_won', v_cas_won, 'wp_post_id', coalesce(p_post_id, v_eq.wp_post_id));
end;
$$;
revoke all on function public.record_wp_sync(uuid, integer, text, jsonb, text, boolean, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.record_wp_sync(uuid, integer, text, jsonb, text, boolean, timestamptz, boolean) to service_role;

-- enqueue 헬퍼는 트리거·DEFINER RPC 내부용 — 직접 호출 차단
revoke all on function public.enqueue_wp_job(uuid, text, integer) from public, anon, authenticated;

-- 9) 패널 조회용 — 장비의 활성 wp_publish 잡 상태(queued/processing/null).
--    jobs는 RLS 정책 0이라 화면이 '동기화 중'을 알 유일한 통로. 읽기 전용 최소 노출.
create or replace function public.get_wp_job_state(p_equipment_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select status from public.jobs
  where type = 'wp_publish'
    and payload->>'equipment_id' = p_equipment_id::text
    and status in ('queued','processing')
  limit 1;
$$;
revoke all on function public.get_wp_job_state(uuid) from public, anon;
grant execute on function public.get_wp_job_state(uuid) to authenticated, service_role;
