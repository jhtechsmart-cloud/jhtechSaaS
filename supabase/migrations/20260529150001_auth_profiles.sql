-- E1 Foundation #1 — profiles 테이블 + auth.users 자동 연결 트리거
-- 의도: 평문 비번 폐기, Supabase Auth(auth.users)와 1:1 profiles. capability 권한은 permissions[].
-- 단일테넌트 → tenant_id 없음.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  permissions text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- auth.users INSERT 시 profiles 행 자동 생성 (D3).
-- SECURITY DEFINER + search_path='' (권한상승·경로주입 방지). name은 메타→이메일→폴백 순.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.email, '(이름없음)')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS 활성화 (정책은 다음 마이그레이션 permissions 에서 추가; 그 전까지는 기본 거부).
alter table public.profiles enable row level security;
