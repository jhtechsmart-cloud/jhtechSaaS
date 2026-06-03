-- M2 P-F #24 — 통합 고객이력 RPC: get_company_request_history(견적·AS·소모품 한 번에).
-- plan-eng-review Issue#1: 테이블 RLS 정책 위닝 대신 DEFINER RPC(테이블 정책 4개 무변경 → 회귀 0).
--   이유: applications RLS 위닝은 per-row regexp_replace EXISTS라 앱 전역 blast radius,
--   supply_request_items SELECT는 부모 로직 인라인 복제라 부모 정책만 넓혀선 items 누락.
--   기존 search_applications_for_customer가 동일 DEFINER+customers.manage 게이트 선례.
-- Issue#2: 견적은 biz_no 정규화 매칭 OR companies.source_application_id UNION(NULL biz_no 고객도 출처 견적 표시).
-- 담당자 무관 전체 열람: DEFINER라 RLS 우회, 게이트는 has_permission(customers.manage)(admin=users.manage 자동통과).

create or replace function public.get_company_request_history(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_biz text;
  v_source uuid;
begin
  if not public.has_permission((select auth.uid()), 'customers.manage') then
    raise exception 'permission denied: customers.manage required' using errcode = '42501';
  end if;

  -- 회사 사업자번호(정규화) + 자동생성 출처 견적. 회사 없으면 둘 다 null → 빈 결과.
  select nullif(regexp_replace(coalesce(biz_no, ''), '\D', '', 'g'), ''), source_application_id
    into v_biz, v_source
    from public.companies
    where id = p_company_id;

  return jsonb_build_object(
    -- 견적: 정규화 biz_no 매칭 OR 출처 견적(source_application_id). 미매칭/무번호 견적은 제외.
    'applications', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', a.id, 'seq_no', a.seq_no, 'company', a.company,
                 'status', a.status, 'created_at', a.created_at
               )
               order by a.created_at desc
             )
      from public.applications a
      where (v_biz is not null and regexp_replace(coalesce(a.biz_no, ''), '\D', '', 'g') = v_biz)
         or (v_source is not null and a.id = v_source)
    ), '[]'::jsonb),

    -- AS: company_id 연결 전체(담당자 무관).
    'service_requests', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', s.id, 'seq_no', s.seq_no, 'status', s.status,
                 'company_equipment_id', s.company_equipment_id, 'created_at', s.created_at
               )
               order by s.created_at desc
             )
      from public.service_requests s
      where s.company_id = p_company_id
    ), '[]'::jsonb),

    -- 소모품: company_id 연결 전체 + 품목수·품목 스냅샷 집계.
    'supply_requests', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', sr.id, 'seq_no', sr.seq_no, 'status', sr.status, 'created_at', sr.created_at,
                 'item_count', (select count(*)::int from public.supply_request_items i where i.request_id = sr.id),
                 'items', coalesce((
                   select jsonb_agg(
                            jsonb_build_object('consumable_name_snapshot', i.consumable_name_snapshot, 'qty', i.qty)
                            order by i.created_at
                          )
                   from public.supply_request_items i
                   where i.request_id = sr.id
                 ), '[]'::jsonb)
               )
               order by sr.created_at desc
             )
      from public.supply_requests sr
      where sr.company_id = p_company_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_company_request_history(uuid) from public;
grant execute on function public.get_company_request_history(uuid) to authenticated;
