-- '견적요청에서 고객 가져오기' 검색 RPC — customers.edit 보유자도 본인 조회 범위 안에서 검색 허용(구현현황비고 #25).
--
-- 왜: 고객 등록 화면 진입·등록 RPC(upsert_company_from_application)는 customers.edit인데 검색 RPC만
-- customers.view_all을 요구해, edit만 가진 영업은 검색 시 '권한이 없습니다'가 떴다.
-- 변경:
--  · customers.view_all → 기존과 같이 전체 의뢰 검색.
--  · customers.edit만 → applications SELECT RLS(applications_select)와 같은 행 범위만 검색
--    (본인 담당 OR applications.view_all OR 미배정+applications.claim). DEFINER라 RLS가 안 걸리므로 함수 안에서 재현.
--  · 둘 다 없으면 기존과 같이 42501.
create or replace function public.search_applications_for_customer(p_query text)
returns table (id uuid, seq_no text, company text, biz_no text, ceo text, phone text, email text, created_at timestamptz)
language plpgsql security definer set search_path = '' stable as $$
declare
  v_uid uuid := (select auth.uid());
  v_q text := btrim(coalesce(p_query, ''));
  v_digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  v_like text;
  v_all boolean;
  v_app_all boolean;
  v_claim boolean;
begin
  v_all := public.has_permission(v_uid, 'customers.view_all');
  if not v_all and not public.has_permission(v_uid, 'customers.edit') then
    raise exception 'permission denied: customers.view_all or customers.edit required' using errcode = '42501';
  end if;
  v_app_all := public.has_permission(v_uid, 'applications.view_all');
  v_claim := public.has_permission(v_uid, 'applications.claim');
  if char_length(v_q) < 2 or char_length(v_q) > 200 then return; end if;
  v_like := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select a.id, a.seq_no, a.company, a.biz_no, a.ceo, a.phone, a.email, a.created_at
    from public.applications a
    where (
        a.company ilike '%' || v_like || '%' escape '\'
        or a.seq_no ilike '%' || v_like || '%' escape '\'
        or (char_length(v_digits) >= 3 and a.biz_no ilike '%' || v_digits || '%')
      )
      and (
        v_all or v_app_all
        or a.assignee_id = v_uid
        or (a.assignee_id is null and v_claim)
      )
    order by a.created_at desc
    limit 20;
end;
$$;
revoke all on function public.search_applications_for_customer(text) from public, anon;
grant execute on function public.search_applications_for_customer(text) to authenticated;
