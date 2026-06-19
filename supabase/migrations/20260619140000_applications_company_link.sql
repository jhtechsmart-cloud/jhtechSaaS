-- 수기 견적·고객 연결용 applications.company_id.
-- 공개폼 의뢰는 null, 수기/연결 경로(create_manual_quote)만 값. 회사 삭제 시 견적 행은 보존(SET NULL).
-- 고객 이력 RPC(get_company_request_history)가 biz_no·source_application_id 외에 company_id로도 매칭하게 하기 위함.
alter table public.applications
  add column company_id uuid references public.companies(id) on delete set null;

-- 이력 조회·역참조용 인덱스.
create index applications_company_idx on public.applications (company_id);

-- 서버통제값 트리거 갱신: company_id는 생성 시점 확정값, UPDATE 불변(감사). seq_no·created_at·source 기존 동작 유지.
-- (20260607130000 정의 기준 — 누락 컬럼 없이 company_id만 추가)
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
    new.source := old.source; -- source는 생성 시점 확정값(공개/수기), 이후 변조 불가
    new.company_id := old.company_id; -- company_id도 생성 시점 확정, 이후 변조 불가
  end if;
  return new;
end;
$$;
