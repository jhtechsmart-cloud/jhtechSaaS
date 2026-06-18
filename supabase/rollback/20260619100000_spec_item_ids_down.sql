-- 롤백 — 사양 항목에서 id 키 제거(되돌림). pdf는 이 마이그가 안 건드렸으므로 그대로.
update public.equipment e
set specs = (
  select jsonb_agg(
    jsonb_set(
      grp,
      '{items}',
      (
        select coalesce(jsonb_agg(item - 'id'), '[]'::jsonb)
        from jsonb_array_elements(coalesce(grp -> 'items', '[]'::jsonb)) item
      )
    )
  )
  from jsonb_array_elements(e.specs) grp
)
where jsonb_typeof(e.specs) = 'array'
  and jsonb_array_length(e.specs) > 0
  and (e.specs -> 0) ? 'items'; -- 그룹형만(up과 동일 가드)
