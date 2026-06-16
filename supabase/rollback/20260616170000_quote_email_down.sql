-- 롤백: 20260616170000_quote_email.sql
-- enqueue RPC + email_log 상태기계/컬럼 + profiles.hiworks_user_id 원복.
-- ⚠️ 롤백 전 email 잡 큐를 비울 것(워커 case "email" 제거 시 미처리 잡이 '알 수 없는 잡'으로 실패).

drop function if exists public.enqueue_quote_email(uuid, text, text, text, text, text);

drop index if exists public.email_log_active_quote;

-- 상태기계 원복(sending 제거). 'sending'/'sent' 잔여 행이 있으면 먼저 정리 필요.
alter table public.email_log drop constraint if exists email_log_status_check;
alter table public.email_log
  add constraint email_log_status_check
    check (status in ('pending', 'sent', 'failed'));

alter table public.email_log
  drop column if exists from_user_id,
  drop column if exists subject;

alter table public.profiles
  drop column if exists hiworks_user_id;
