-- E5 둘째 슬라이스 — 견적번호 채번 + 버전 자동 도출 + (다음) 불변버전.
-- 형식: JHQ-YYYYMMDD-NNN-VN. NNN=연도별 리셋(1년 누적), VN=재발행 차수.
-- 번호 유지+차수: 같은 application의 재발행은 base 유지, -VN만 증가.

-- 1. 연도 카운터 테이블 — 연도별 리셋의 핵심.
-- 전역 sequence는 리셋이 안 되므로 미사용. ON CONFLICT DO UPDATE로 원자적 증가(행 잠금 → 레이스 0).
-- 새 연도는 새 행이 자동 생성 → 001부터 리셋.
create table public.quote_number_counters (
  year int primary key,
  last_seq int not null default 0
);
-- 정책 없음 = anon/authenticated 직접 접근 0. SECURITY DEFINER 함수만 갱신(RLS 우회).
alter table public.quote_number_counters enable row level security;

-- 2. 채번 함수 — base 번호(JHQ-YYYYMMDD-NNN) 생성.
-- SECURITY DEFINER로 카운터 갱신(호출자 권한 불필요). KST 기준 연/날짜.
-- NNN 3자리 0패딩, 999 초과 시 자릿수 확장(lpad 잘림 회피 — applications 패턴과 동일).
create or replace function public.next_quote_base_no()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  yr int := extract(year from (now() at time zone 'Asia/Seoul'))::int;
  v int;
begin
  insert into public.quote_number_counters (year, last_seq)
  values (yr, 1)
  on conflict (year) do update set last_seq = public.quote_number_counters.last_seq + 1
  returning last_seq into v;

  return 'JHQ-'
    || to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDD')
    || '-'
    || case when v >= 1000 then v::text else lpad(v::text, 3, '0') end;
end;
$$;

-- 3. 트리거 — INSERT 시 quote_no·version 서버 강제(클라 지정 무시).
-- 같은 application 첫 견적이면 새 base + V1, 재발행이면 base 유지 + version=MAX+1.
-- created_at=now(), status='issued'면 issued_at=now(). UPDATE 불변 로직은 다음 단계.
create or replace function public.quotes_enforce_server_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  prev_quote_no text;
  prev_version int;
begin
  if tg_op = 'INSERT' then
    select quote_no, version into prev_quote_no, prev_version
    from public.quotes
    where application_id = new.application_id
    order by version desc
    limit 1;

    if prev_version is null then
      new.version := 1;
      new.quote_no := public.next_quote_base_no() || '-V1';
    else
      new.version := prev_version + 1;
      new.quote_no := regexp_replace(prev_quote_no, '-V[0-9]+$', '') || '-V' || new.version::text;
    end if;
    new.created_at := now();
    if new.status = 'issued' then
      new.issued_at := now();
    end if;
  elsif tg_op = 'UPDATE' then
    -- 서버 통제 식별 필드는 항상 OLD 보존(draft도 불변).
    new.quote_no := old.quote_no;
    new.version := old.version;
    new.application_id := old.application_id;
    new.created_at := old.created_at;

    if old.status = 'issued' then
      -- 발행본 동결: pdf_url 외 어떤 값이 바뀌어도 예외. 재발행은 새 버전 행으로.
      if new.status is distinct from old.status
        or new.items is distinct from old.items
        or new.options is distinct from old.options
        or new.supply_price is distinct from old.supply_price
        or new.tax_price is distinct from old.tax_price
        or new.total is distinct from old.total
        or new.assignee_id is distinct from old.assignee_id
        or new.issued_at is distinct from old.issued_at then
        raise exception '발행된 견적은 수정할 수 없습니다(재발행은 새 버전으로).'
          using errcode = 'check_violation';
      end if;
    else
      -- draft→issued 전환 시 issued_at 서버 기록.
      if new.status = 'issued' and old.status <> 'issued' then
        new.issued_at := now();
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger quotes_server_fields
  before insert or update on public.quotes
  for each row execute function public.quotes_enforce_server_fields();
