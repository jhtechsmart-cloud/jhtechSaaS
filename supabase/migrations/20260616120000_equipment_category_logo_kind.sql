-- 견적서 PDF 좌상단 회사로고를 장비 종류별로 분기하기 위한 분류 속성.
-- quote_logo_kind = 'cutter'(커팅기 로고) | 'printer'(프린터 로고) | null(미지정 → 기본 로고).
-- 대분류(parent_id null)에만 의미가 있다 → 값이 있으면 반드시 대분류여야 한다는 가드 CHECK.
-- 쓰기 권한·트리거(updated_at 갱신)는 기존 equipment_category RLS·트리거를 그대로 따른다(컬럼 추가만).

alter table public.equipment_category
  add column quote_logo_kind text,
  add constraint equipment_category_quote_logo_kind_chk
    check (
      quote_logo_kind is null
      or (quote_logo_kind in ('cutter', 'printer') and parent_id is null)
    );

comment on column public.equipment_category.quote_logo_kind is
  '견적서 PDF 좌상단 회사로고 종류(대분류에만 설정): cutter=커팅기 로고, printer=프린터 로고, null=기본 로고';
