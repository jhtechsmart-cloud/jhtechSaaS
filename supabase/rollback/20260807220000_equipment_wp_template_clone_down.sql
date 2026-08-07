-- #262 롤백 — 템플릿 복제 v2 스키마 되돌리기 (v1 = 20260804183000 상태로)
drop function if exists public.record_wp_sync(uuid, integer, text, jsonb, text, boolean, timestamptz, boolean, text);
drop function if exists public.resolve_wp_template_post_id(uuid);

-- v1 정의 복원: equipment_wp_fields_changed (신규 컬럼 제거 전에 재정의 — 컬럼 참조 제거)
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
    or p_new.category_id is distinct from p_old.category_id;
$$;

-- v1 정의 복원: equipment_wp_guard (wp_render_mode 제거)
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

  v_fields_changed := public.equipment_wp_fields_changed(old, new);

  if new.wp_publish_enabled and v_fields_changed then
    new.wp_dirty := true;
    new.wp_dirty_at := clock_timestamp();
  end if;

  return new;
end;
$$;

-- v1 정의 복원: record_wp_sync (8-인자)
create function public.record_wp_sync(
  p_equipment_id uuid,
  p_post_id integer,
  p_post_status text,
  p_media jsonb,
  p_last_error text,
  p_clear_error boolean,
  p_dirty_snapshot timestamptz,
  p_replace boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eq public.equipment;
begin
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
revoke all on function public.record_wp_sync(uuid, integer, text, jsonb, text, boolean, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.record_wp_sync(uuid, integer, text, jsonb, text, boolean, timestamptz, boolean) to service_role;

-- v1 정의 복원: enqueue_wp_publish (force_sync 제거)
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
  else -- unpublish
    if v_eq.wp_post_id is null then raise exception '홈페이지 글이 없습니다'; end if;
    perform public.enqueue_wp_job(v_eq.id, 'unpublish', v_eq.wp_post_id);
  end if;
end;
$$;

alter table public.equipment_category drop column if exists wp_template_post_id;
alter table public.equipment
  drop column if exists wp_render_mode,
  drop column if exists wp_series_name,
  drop column if exists wp_subtitle;
