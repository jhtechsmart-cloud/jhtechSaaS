-- rollback: applications_pa
alter table public.applications drop column equipment_id;
alter table public.applications drop column privacy_consent;
alter table public.applications drop column privacy_consent_at;
alter table public.applications drop column privacy_consent_version;
