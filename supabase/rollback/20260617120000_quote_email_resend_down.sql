-- 롤백 — 멱등 잠금을 다시 sent 포함으로 복원(20260616170000 상태).
drop index if exists public.email_log_active_quote;
create unique index email_log_active_quote
  on public.email_log (quote_id)
  where status in ('pending', 'sending', 'sent');

-- RPC 중복검사 술어·문구를 이전으로 되돌린다(동일 함수, 술어 1줄·메시지만 차이).
create or replace function public.enqueue_quote_email(
  p_quote_id uuid, p_to text, p_cc text default null, p_bcc text default null,
  p_subject text default null, p_body text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_quote public.quotes;
  v_hiworks text;
  v_to text := btrim(coalesce(p_to, ''));
  v_cc text := nullif(btrim(coalesce(p_cc, '')), '');
  v_bcc text := nullif(btrim(coalesce(p_bcc, '')), '');
  v_subject text := nullif(regexp_replace(coalesce(p_subject, ''), '[\r\n]+', ' ', 'g'), '');
  v_email_re text := '^[^@[:space:],]+@[^@[:space:],]+\.[^@[:space:],]+$';
  v_log_id uuid;
begin
  if not public.has_permission(v_uid, 'email.send') then
    raise exception '메일 발송 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  select * into v_quote from public.quotes where id = p_quote_id;
  if not found then raise exception '존재하지 않는 견적입니다: %', p_quote_id; end if;
  if not (v_quote.assignee_id = v_uid or public.has_permission(v_uid, 'applications.view_all')) then
    raise exception '이 견적에 접근 권한이 없습니다' using errcode = 'insufficient_privilege'; end if;
  if v_quote.status <> 'issued' then raise exception '발행된 견적만 발송할 수 있습니다'; end if;
  if v_quote.pdf_url is null then raise exception '견적서 PDF가 아직 생성되지 않았습니다'; end if;
  select hiworks_user_id into v_hiworks from public.profiles where id = v_uid;
  v_hiworks := nullif(btrim(coalesce(v_hiworks, '')), '');
  if v_hiworks is null then raise exception '담당자 하이웍스 ID가 설정되지 않았습니다(관리자에서 설정 필요)'; end if;
  if v_to !~ v_email_re then raise exception '받는 사람 이메일 형식이 올바르지 않습니다: %', v_to; end if;
  if v_cc is not null and v_cc !~ v_email_re then raise exception '참조(cc) 이메일 형식이 올바르지 않습니다'; end if;
  if v_bcc is not null and v_bcc !~ v_email_re then raise exception '숨은참조(bcc) 이메일 형식이 올바르지 않습니다'; end if;
  if char_length(coalesce(v_subject, '')) > 200 then raise exception '제목이 너무 깁니다(최대 200자)'; end if;
  if char_length(coalesce(p_body, '')) > 5000 then raise exception '본문이 너무 깁니다(최대 5000자)'; end if;
  if exists (select 1 from public.email_log where quote_id = p_quote_id and status in ('pending','sending','sent')) then
    raise exception '이미 발송했거나 발송 대기 중인 견적입니다'; end if;
  insert into public.email_log (application_id, quote_id, to_email, from_user_id, subject, status)
  values (v_quote.application_id, p_quote_id, v_to, v_uid, v_subject, 'pending') returning id into v_log_id;
  insert into public.jobs (type, payload) values ('email', jsonb_build_object(
    'email_log_id', v_log_id, 'quote_id', p_quote_id, 'from_user_id', v_uid, 'hiworks_user_id', v_hiworks,
    'to', v_to, 'cc', v_cc, 'bcc', v_bcc, 'subject', v_subject, 'body', coalesce(p_body, '')));
  return jsonb_build_object('email_log_id', v_log_id);
end; $$;
revoke all on function public.enqueue_quote_email(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.enqueue_quote_email(uuid, text, text, text, text, text) to authenticated;
