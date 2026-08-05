-- #253 롤백 — equipment WP 연동 컬럼·트리거·RPC 제거 (20260804183000_equipment_wp_sync)
drop function if exists public.get_wp_job_state(uuid);
drop function if exists public.record_wp_sync(uuid, integer, text, jsonb, text, boolean, timestamptz, boolean);
drop function if exists public.enqueue_wp_publish(uuid, text);
drop trigger if exists equipment_wp_enqueue_trg on public.equipment;
drop function if exists public.equipment_wp_enqueue();
drop function if exists public.enqueue_wp_job(uuid, text, integer);
drop trigger if exists equipment_wp_guard_trg on public.equipment;
drop function if exists public.equipment_wp_guard();
drop index if exists public.jobs_wp_publish_active_uniq;
alter table public.equipment
  drop column if exists wp_publish_enabled,
  drop column if exists wp_post_id,
  drop column if exists wp_post_status,
  drop column if exists wp_media,
  drop column if exists wp_dirty,
  drop column if exists wp_dirty_at,
  drop column if exists wp_last_error,
  drop column if exists wp_synced_at;
drop function if exists public.resolve_wp_category_id(uuid);
alter table public.equipment_category drop column if exists wp_category_id;
