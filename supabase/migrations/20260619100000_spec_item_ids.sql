-- 견적서 PDF 사양 선택 #1 — 기존 equipment.specs 항목에 안정 id 부여.
-- specs = jsonb [{group, icon, items:[{label,value}]}]. 각 item에 id(uuid)를 채운다.
-- 이미 id 있는 항목은 보존. pdf 플래그는 건드리지 않음(미설정=워커 폴백으로 전체 렌더).
-- ⚠️ 그룹형 구조(첫 원소에 items 키)만 처리. 평면 레거시([{label,value}], items 키 없음)는
--    이미 20260601170001에서 그룹형으로 변환됐고, 만약 남아 있어도 jsonb_set로 items:[] 키를
--    덧붙이면 parseSpecs가 그룹형으로 오분류한다 → WHERE 가드로 평면 행은 건드리지 않는다.
update public.equipment e
set specs = (
  select jsonb_agg(
    jsonb_set(
      grp,
      '{items}',
      (
        select coalesce(jsonb_agg(
          case
            when (item ? 'id') and nullif(item ->> 'id', '') is not null then item
            else item || jsonb_build_object('id', gen_random_uuid()::text)
          end
        ), '[]'::jsonb)
        from jsonb_array_elements(coalesce(grp -> 'items', '[]'::jsonb)) item
      )
    )
  )
  from jsonb_array_elements(e.specs) grp
)
where jsonb_typeof(e.specs) = 'array'
  and jsonb_array_length(e.specs) > 0
  and (e.specs -> 0) ? 'items'; -- 그룹형만(평면 레거시 보호)
