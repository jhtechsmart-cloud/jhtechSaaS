-- 롤백: 20260607130000_quote_create_rpc.sql
-- 견적 생성 RPC·헬퍼 제거 + applications.source 컬럼 제거 + 트리거 함수 원복.
drop function if exists public.create_manual_quote(text, text, text, text, jsonb, jsonb, text);
drop function if exists public.create_quote(uuid, jsonb, jsonb, text);
drop function if exists public._quote_insert(uuid, jsonb, jsonb, text);
drop function if exists public._quote_validate_lines(jsonb);

-- 트리거 함수에서 source 불변 줄 제거(원래 형태로 복원).
create or replace function public.applications_enforce_server_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.seq_no := public.next_application_seq_no();
    new.created_at := now();
  elsif tg_op = 'UPDATE' then
    new.seq_no := old.seq_no;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

alter table public.applications drop column if exists source;
