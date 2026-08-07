-- #262: 장비 → 홈페이지 자동 등록 v2 — Elementor 템플릿 복제 지원 스키마
--   · equipment.wp_subtitle / wp_series_name = 폼 수정 가능(홈페이지 부제·영문 시리즈명, 빈 값 = 슬롯 숨김)
--   · equipment.wp_render_mode = 서버통제(record_wp_sync 경유만) — 'elementor'면 레거시 HTML 폴백 금지(침묵 품질 회귀 방지)
--   · equipment_category.wp_template_post_id = 분류별 템플릿 글 매핑(조상 폴백 해석 — resolve_wp_category_id 패턴)
--   · equipment_wp_fields_changed()에 신규 반영 필드 2종 추가(누락 시 부제 수정이 영원히 미반영 — autoplan Eng 지적)

-- 1) 컬럼
alter table public.equipment
  add column wp_subtitle text,
  add column wp_series_name text,
  add column wp_render_mode text
    check (wp_render_mode is null or wp_render_mode in ('html', 'elementor'));

alter table public.equipment_category
  add column wp_template_post_id integer;

-- 2) 반영 필드 비교 재정의 — 단일 출처(가드 dirty 계산·enqueue 공유)에 신규 2종 추가
create or replace function public.equipment_wp_fields_changed(p_old public.equipment, p_new public.equipment)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_new.name is distinct from p_old.name
    or p_new.model is distinct from p_old.model
    or p_new.photos is distinct from p_old.photos
    or p_new.specs is distinct from p_old.specs
    or p_new.highlights is distinct from p_old.highlights
    or p_new.youtube_urls is distinct from p_old.youtube_urls
    or p_new.category_id is distinct from p_old.category_id
    or p_new.wp_subtitle is distinct from p_old.wp_subtitle
    or p_new.wp_series_name is distinct from p_old.wp_series_name;
$$;

-- 3) 가드 재정의 — wp_render_mode를 서버통제 목록에 추가(INSERT 초기화·UPDATE 옛값 유지)
create or replace function public.equipment_wp_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fields_changed boolean;
begin
  if tg_op = 'INSERT' then
    new.wp_post_id := null;
    new.wp_post_status := null;
    new.wp_media := '{}'::jsonb;
    new.wp_dirty := false;
    new.wp_dirty_at := null;
    new.wp_last_error := null;
    new.wp_synced_at := null;
    new.wp_render_mode := null;
    return new;
  end if;

  if coalesce(current_setting('app.wp_sync', true), '') = '1' then
    return new;
  end if;

  new.wp_post_id := old.wp_post_id;
  new.wp_post_status := old.wp_post_status;
  new.wp_media := old.wp_media;
  new.wp_dirty := old.wp_dirty;
  new.wp_dirty_at := old.wp_dirty_at;
  new.wp_last_error := old.wp_last_error;
  new.wp_synced_at := old.wp_synced_at;
  new.wp_render_mode := old.wp_render_mode;

  v_fields_changed := public.equipment_wp_fields_changed(old, new);

  if new.wp_publish_enabled and v_fields_changed then
    new.wp_dirty := true;
    new.wp_dirty_at := clock_timestamp();
  end if;

  return new;
end;
$$;

-- 4) 템플릿 글 해석 — 소분류에 없으면 조상으로 폴백(resolve_wp_category_id 패턴 동형)
create or replace function public.resolve_wp_template_post_id(p_category_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  with recursive chain as (
    select id, parent_id, wp_template_post_id, 1 as depth
    from public.equipment_category where id = p_category_id
    union all
    select ec.id, ec.parent_id, ec.wp_template_post_id, chain.depth + 1
    from public.equipment_category ec
    join chain on ec.id = chain.parent_id
    where chain.depth < 10
  )
  select wp_template_post_id from chain where wp_template_post_id is not null order by depth limit 1;
$$;
revoke all on function public.resolve_wp_template_post_id(uuid) from public, anon;
grant execute on function public.resolve_wp_template_post_id(uuid) to authenticated, service_role;

-- 5) record_wp_sync 재정의 — p_render_mode 추가(서버통제 컬럼의 단일 진입점 유지).
--    시그니처가 바뀌므로 구버전을 drop(create or replace는 다른 시그니처면 오버로드를 만들어
--    PostgREST rpc 해석이 모호해진다). 신버전은 default가 있어 구 워커의 8-인자 named 호출도 그대로 동작.
drop function public.record_wp_sync(uuid, integer, text, jsonb, text, boolean, timestamptz, boolean);
create function public.record_wp_sync(
  p_equipment_id uuid,
  p_post_id integer,
  p_post_status text,
  p_media jsonb,
  p_last_error text,
  p_clear_error boolean,
  p_dirty_snapshot timestamptz,
  p_replace boolean default false,
  p_render_mode text default null -- 'html' | 'elementor' — 글 본문을 마지막으로 쓴 주체 기록
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eq public.equipment;
begin
  if p_render_mode is not null and p_render_mode not in ('html', 'elementor') then
    raise exception '잘못된 render_mode: %', p_render_mode;
  end if;

  select * into v_eq from public.equipment where id = p_equipment_id for update;
  if v_eq.id is null then
    return jsonb_build_object('cas_won', false, 'wp_post_id', null, 'missing', true);
  end if;

  if p_post_id is not null and not p_replace then
    if v_eq.wp_post_id is not null and v_eq.wp_post_id <> p_post_id then
      return jsonb_build_object('cas_won', false, 'wp_post_id', v_eq.wp_post_id);
    end if;
  end if;

  perform set_config('app.wp_sync', '1', true);
  update public.equipment set
    wp_post_id = case when p_replace then p_post_id else coalesce(p_post_id, wp_post_id) end,
    wp_post_status = coalesce(p_post_status, wp_post_status),
    wp_media = coalesce(p_media, wp_media),
    wp_render_mode = coalesce(p_render_mode, wp_render_mode),
    wp_last_error = case when p_clear_error then null else coalesce(p_last_error, wp_last_error) end,
    wp_synced_at = case when p_post_id is not null or p_post_status is not null then now() else wp_synced_at end,
    wp_dirty = case
      when wp_dirty and wp_dirty_at is not distinct from p_dirty_snapshot then false
      else wp_dirty
    end
  where id = p_equipment_id;
  perform set_config('app.wp_sync', '', true);

  return jsonb_build_object('cas_won', true, 'wp_post_id', coalesce(p_post_id, v_eq.wp_post_id));
end;
$$;
revoke all on function public.record_wp_sync(uuid, integer, text, jsonb, text, boolean, timestamptz, boolean, text) from public, anon, authenticated;
grant execute on function public.record_wp_sync(uuid, integer, text, jsonb, text, boolean, timestamptz, boolean, text) to service_role;

-- 6) enqueue_wp_publish 재정의 — force_sync 추가(수동 편집 감지 무시 덮어쓰기, users.manage 전용 탈출구).
--    409 오탐 영구 잠금의 유일한 해제 경로. 잡 payload에 force=true를 실어 워커→플러그인으로 전달.
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
  if p_action not in ('publish','refresh','sync','unpublish','force_sync') then
    raise exception '알 수 없는 동작: %', p_action;
  end if;
  if p_action = 'force_sync'
     and not (select public.has_permission((select auth.uid()), 'users.manage')) then
    raise exception '권한이 없습니다 (users.manage) — 수동 편집 덮어쓰기는 관리자 전용';
  end if;

  select * into v_eq from public.equipment where id = p_equipment_id for update;
  if v_eq.id is null then
    raise exception '장비를 찾을 수 없습니다';
  end if;

  if exists (
    select 1 from public.jobs
    where type = 'wp_publish' and status in ('queued','processing')
      and payload->>'equipment_id' = p_equipment_id::text
  ) then
    raise exception '이미 동기화가 진행 중입니다. 잠시 후 다시 시도하세요.';
  end if;

  if p_action = 'publish' then
    if not v_eq.wp_publish_enabled then raise exception '홈페이지 등록이 체크되지 않은 장비입니다'; end if;
    if v_eq.status <> 'active' then raise exception '비활성 장비는 발행할 수 없습니다'; end if;
    if v_eq.wp_post_id is null then raise exception '초안이 아직 생성되지 않았습니다'; end if;
    if v_eq.wp_post_status = 'publish' then raise exception '이미 공개된 글입니다'; end if;
    perform public.enqueue_wp_job(v_eq.id, 'publish', v_eq.wp_post_id);
  elsif p_action = 'refresh' then
    if v_eq.wp_post_status is distinct from 'publish' then raise exception '공개된 글만 갱신할 수 있습니다'; end if;
    if not v_eq.wp_publish_enabled then raise exception '홈페이지 등록이 체크되지 않은 장비입니다'; end if;
    if v_eq.status <> 'active' then raise exception '비활성 장비는 갱신할 수 없습니다'; end if;
    perform public.enqueue_wp_job(v_eq.id, 'sync', null);
  elsif p_action = 'sync' then
    if not v_eq.wp_publish_enabled then raise exception '홈페이지 등록이 체크되지 않은 장비입니다'; end if;
    if v_eq.wp_post_status = 'publish' then raise exception '공개된 글은 [홈페이지 갱신]을 사용하세요'; end if;
    if public.resolve_wp_category_id(v_eq.category_id) is null then raise exception '분류의 WP 카테고리 설정이 필요합니다'; end if;
    perform public.enqueue_wp_job(v_eq.id, 'sync', null);
  elsif p_action = 'force_sync' then
    -- 수동 편집(409) 잠금 해제: 초안·공개 무관, 체크·매핑만 검증. 잡은 sync + force 플래그.
    if not v_eq.wp_publish_enabled then raise exception '홈페이지 등록이 체크되지 않은 장비입니다'; end if;
    if v_eq.status <> 'active' then raise exception '비활성 장비는 동기화할 수 없습니다'; end if;
    if public.resolve_wp_category_id(v_eq.category_id) is null then raise exception '분류의 WP 카테고리 설정이 필요합니다'; end if;
    begin
      insert into public.jobs (type, payload)
      values ('wp_publish', jsonb_strip_nulls(jsonb_build_object(
        'equipment_id', v_eq.id, 'action', 'sync', 'force', true
      )));
    exception when unique_violation then
      -- EXISTS 선체크와의 좁은 레이스 — raw 23505 대신 기존 안내문으로(enqueue_wp_job 패턴 동일).
      raise exception '이미 동기화가 진행 중입니다. 잠시 후 다시 시도하세요.';
    end;
  else -- unpublish
    if v_eq.wp_post_id is null then raise exception '홈페이지 글이 없습니다'; end if;
    perform public.enqueue_wp_job(v_eq.id, 'unpublish', v_eq.wp_post_id);
  end if;
end;
$$;
