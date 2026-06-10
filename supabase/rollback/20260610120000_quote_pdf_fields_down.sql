alter table public.equipment
  drop constraint if exists equipment_quote_banner_top_path,
  drop constraint if exists equipment_quote_banner_bottom_path,
  drop column if exists quote_banner_top,
  drop column if exists quote_banner_bottom;
alter table public.profiles drop column if exists phone;
