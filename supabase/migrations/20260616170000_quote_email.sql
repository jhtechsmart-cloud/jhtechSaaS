-- E6 #1 — 견적 메일 발송(하이웍스): profiles.hiworks_user_id + email_log 상태기계/컬럼 + enqueue_quote_email RPC.
-- 멱등성: 메일은 PDF 잡과 달리 자연 멱등성이 없다(재시도=중복 발송). email_log 상태기계
--   (pending→sending→sent/failed) + 부분 유니크 인덱스(한 견적당 활성 발송 1건)로 강제.
-- 보안: 발송자 = auth.uid()(클라 입력 미신뢰). 입력 검증·중복 거부·행 스코프는 서버(RPC)가 강제.
-- (autoplan Eng 리뷰 반영: from_user_id 강제·입력검증·payload email_log_id·상태기계)

-- 1. 담당자 → 하이웍스 사용자 계정 ID 매핑. nullable(없으면 발송 차단).
alter table public.profiles
  add column if not exists hiworks_user_id text;

-- 2. email_log: 발송 담당자 FK + 제목(감사) + 상태기계에 'sending' 추가.
alter table public.email_log
  add column if not exists from_user_id uuid references public.profiles (id),
  add column if not exists subject text;

alter table public.email_log drop constraint if exists email_log_status_check;
alter table public.email_log
  add constraint email_log_status_check
    check (status in ('pending', 'sending', 'sent', 'failed'));

-- 멱등 강제: 한 견적(버전)당 활성 발송 1건만(pending/sending/sent). failed는 재발송 허용.
-- 워커 재시도·스테일 회수가 중복 발송으로 번지지 않게 하는 DB 레벨 백스톱.
create unique index if not exists email_log_active_quote
  on public.email_log (quote_id)
  where status in ('pending', 'sending', 'sent');

-- 3. enqueue_quote_email — 발송 요청 결선 RPC.
-- DEFINER가 RLS 우회 → email.send 명시 검사 + 행 스코프(배정 본인/view_all) 검사.
-- 발송자 = auth.uid()(클라 미신뢰). issued + pdf_url + 발송자 hiworks_user_id 필수.
-- email_log(pending) + jobs(type=email, payload.email_log_id) 원자 insert(한 함수=한 트랜잭션).
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
  -- 단일 주소만 허용(개행·콤마·공백 차단 → 헤더/대량발송 인젝션 방지)
  v_email_re text := '^[^@[:space:],]+@[^@[:space:],]+\.[^@[:space:],]+$';
  v_log_id uuid;
begin
  -- 권한
  if not public.has_permission(v_uid, 'email.send') then
    raise exception '메일 발송 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;

  -- 견적 조회 + 행 스코프(배정 본인 또는 전체열람)
  select * into v_quote from public.quotes where id = p_quote_id;
  if not found then
    raise exception '존재하지 않는 견적입니다: %', p_quote_id;
  end if;
  if not (v_quote.assignee_id = v_uid
          or public.has_permission(v_uid, 'applications.view_all')) then
    raise exception '이 견적에 접근 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;

  -- 발행본 + PDF 생성 완료라야 발송 가능
  if v_quote.status <> 'issued' then
    raise exception '발행된 견적만 발송할 수 있습니다';
  end if;
  if v_quote.pdf_url is null then
    raise exception '견적서 PDF가 아직 생성되지 않았습니다';
  end if;

  -- 발송자 = 호출자(auth.uid()). 그 사람의 하이웍스 계정 ID 필수.
  select hiworks_user_id into v_hiworks from public.profiles where id = v_uid;
  v_hiworks := nullif(btrim(coalesce(v_hiworks, '')), '');
  if v_hiworks is null then
    raise exception '담당자 하이웍스 ID가 설정되지 않았습니다(관리자에서 설정 필요)';
  end if;

  -- 수신처 검증
  if v_to !~ v_email_re then
    raise exception '받는 사람 이메일 형식이 올바르지 않습니다: %', v_to;
  end if;
  if v_cc is not null and v_cc !~ v_email_re then
    raise exception '참조(cc) 이메일 형식이 올바르지 않습니다';
  end if;
  if v_bcc is not null and v_bcc !~ v_email_re then
    raise exception '숨은참조(bcc) 이메일 형식이 올바르지 않습니다';
  end if;

  -- 길이 캡(서버 강제 — 클라 검증 신뢰 안 함). 저장소·발송 본문 비대 방지.
  if char_length(coalesce(v_subject, '')) > 200 then
    raise exception '제목이 너무 깁니다(최대 200자)';
  end if;
  if char_length(coalesce(p_body, '')) > 5000 then
    raise exception '본문이 너무 깁니다(최대 5000자)';
  end if;

  -- 중복 발송 거부(부분 유니크 인덱스가 최종 강제; 여기서 친절한 메시지로 선차단)
  if exists (
    select 1 from public.email_log
    where quote_id = p_quote_id and status in ('pending', 'sending', 'sent')
  ) then
    raise exception '이미 발송했거나 발송 대기 중인 견적입니다';
  end if;

  -- email_log(pending) — from_user_id는 서버가 auth.uid()로 강제(클라 미신뢰)
  insert into public.email_log (application_id, quote_id, to_email, from_user_id, subject, status)
  values (v_quote.application_id, p_quote_id, v_to, v_uid, v_subject, 'pending')
  returning id into v_log_id;

  -- 발송 잡 — payload에 email_log_id(워커가 어느 로그 행을 전이할지) + 발송자 고정
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
