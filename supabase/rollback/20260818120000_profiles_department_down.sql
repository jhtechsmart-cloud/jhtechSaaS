-- 롤백: profiles.department 제거(백필 값도 함께 사라짐 — 직책 문자열은 원본 그대로라 재적용 시 재백필 가능).
alter table public.profiles drop column if exists department;
