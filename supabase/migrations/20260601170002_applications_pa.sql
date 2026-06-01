-- M2 P-A — applications: 개인정보 동의 3컬럼 + equipment_id FK.
alter table public.applications
  add column privacy_consent boolean not null default false,
  add column privacy_consent_at timestamptz,
  add column privacy_consent_version text,
  add column equipment_id uuid references public.equipment(id);

-- 기존 fields.equipment_id → 실제 컬럼 백필(정확한 UUID 형식만 — 하이픈 위치 검증·대소문자 무시).
-- 비정형 36자가 ::uuid 캐스트에서 예외를 던져 마이그레이션 전체가 실패하는 것 방지.
update public.applications set equipment_id = (fields->>'equipment_id')::uuid
  where fields ? 'equipment_id'
    and fields->>'equipment_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

create index on public.applications (equipment_id);
