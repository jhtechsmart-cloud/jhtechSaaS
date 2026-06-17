-- E6 후속 — 견적 메일 재발송 허용. 멱등 잠금을 '발송 진행 중'(pending·sending)으로만 좁힌다.
-- 기존(20260616170000)은 sent까지 차단 → 의도적 재발송(오타·반송·다른 주소) 불가가 과했음.
-- 완료(sent)·실패(failed)면 새 발송 허용. 진행 중 1건만 유지 → 더블클릭·재시도 중복은 그대로 차단.

-- 1. 부분 유니크 인덱스: 'sent' 제거.
drop index if exists public.email_log_active_quote;
create unique index email_log_active_quote
  on public.email_log (quote_id)
  where status in ('pending', 'sending');

-- 2. RPC 중복검사도 진행 중만 차단 + 문구 갱신(그 외 로직·시그니처 불변).
create or replace function public.enqueue_quote_email(
  p_quote_id uuid,
  p_to text,
  p_cc text default null,
  p_bcc text default null,
  p_subject text default null,
  p_body text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  if not found then
    raise exception '존재하지 않는 견적입니다: %', p_quote_id;
  end if;
  if not (v_quote.assignee_id = v_uid
          or public.has_permission(v_uid, 'applications.view_all')) then
    raise exception '이 견적에 접근 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;

  if v_quote.status <> 'issued' then
    raise exception '발행된 견적만 발송할 수 있습니다';
  end if;
  if v_quote.pdf_url is null then
    raise exception '견적서 PDF가 아직 생성되지 않았습니다';
  end if;

  select hiworks_user_id into v_hiworks from public.profiles where id = v_uid;
  v_hiworks := nullif(btrim(coalesce(v_hiworks, '')), '');
  if v_hiworks is null then
    raise exception '담당자 하이웍스 ID가 설정되지 않았습니다(관리자에서 설정 필요)';
  end if;

  if v_to !~ v_email_re then
    raise exception '받는 사람 이메일 형식이 올바르지 않습니다: %', v_to;
  end if;
  if v_cc is not null and v_cc !~ v_email_re then
    raise exception '참조(cc) 이메일 형식이 올바르지 않습니다';
  end if;
  if v_bcc is not null and v_bcc !~ v_email_re then
    raise exception '숨은참조(bcc) 이메일 형식이 올바르지 않습니다';
  end if;

  if char_length(coalesce(v_subject, '')) > 200 then
    raise exception '제목이 너무 깁니다(최대 200자)';
  end if;
  if char_length(coalesce(p_body, '')) > 5000 then
    raise exception '본문이 너무 깁니다(최대 5000자)';
  end if;

  -- 중복 발송 거부 — 진행 중(pending·sending)만. 완료/실패면 재발송 허용.
  if exists (
    select 1 from public.email_log
    where quote_id = p_quote_id and status in ('pending', 'sending')
  ) then
    raise exception '이미 발송 진행 중인 견적입니다';
  end if;

  insert into public.email_log (application_id, quote_id, to_email, from_user_id, subject, status)
  values (v_quote.application_id, p_quote_id, v_to, v_uid, v_subject, 'pending')
  returning id into v_log_id;

  insert into public.jobs (type, payload)
  values ('email', jsonb_build_object(
    'email_log_id', v_log_id,
    'quote_id', p_quote_id,
    'from_user_id', v_uid,
    'hiworks_user_id', v_hiworks,
    'to', v_to,
    'cc', v_cc,
    'bcc', v_bcc,
    'subject', v_subject,
    'body', coalesce(p_body, '')
  ));

  return jsonb_build_object('email_log_id', v_log_id);
end;
$$;
revoke all on function public.enqueue_quote_email(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.enqueue_quote_email(uuid, text, text, text, text, text) to authenticated;
