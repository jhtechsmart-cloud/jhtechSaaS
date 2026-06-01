-- M2 P-A — applications: 개인정보 동의 3컬럼 + equipment_id FK.
alter table public.applications
  add column privacy_consent boolean not null default false,
  add column privacy_consent_at timestamptz,
  add column privacy_consent_version text,
  add column equipment_id uuid references public.equipment(id);

-- 기존 fields.equipment_id → 실제 컬럼 백필(uuid 형식인 것만)
update public.applications set equipment_id = (fields->>'equipment_id')::uuid
  where fields ? 'equipment_id' and fields->>'equipment_id' ~ '^[0-9a-f-]{36}$';

create index on public.applications (equipment_id);
