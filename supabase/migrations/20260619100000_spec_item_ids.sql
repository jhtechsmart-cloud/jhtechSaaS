-- 견적서 PDF 사양 선택 #1 — 기존 equipment.specs 항목에 안정 id 부여.
-- specs = jsonb [{group, icon, items:[{label,value}]}]. 각 item에 id(uuid)를 채운다.
-- 이미 id 있는 항목은 보존. pdf 플래그는 건드리지 않음(미설정=워커 폴백으로 전체 렌더).
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
where jsonb_typeof(e.specs) = 'array' and jsonb_array_length(e.specs) > 0;
