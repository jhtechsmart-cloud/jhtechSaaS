// 견적서 PDF 좌상단 회사로고 분기 — 순수 로직(사이드이펙트 없음).
// 장비의 category_id로 대분류(루트)를 찾아 그 분류에 설정된 로고 종류를 돌려준다.
// 소분류면 부모(대분류)의 값을, 대분류면 자기 값을 쓴다. 미설정/미존재면 null(→ 기본 로고).

export type LogoKind = "cutter" | "printer";

export type CategoryLite = {
  id: string;
  parent_id: string | null;
  quote_logo_kind: LogoKind | null;
};

export function resolveLogoKind(
  categoryId: string | null | undefined,
  categories: CategoryLite[],
): LogoKind | null {
  if (!categoryId) return null;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const cat = byId.get(categoryId);
  if (!cat) return null;
  // 소분류면 부모(대분류)로 거슬러 올라간다(2단계 강제라 한 번이면 충분). 부모가 사라졌으면 자기 값 폴백.
  const root = cat.parent_id ? byId.get(cat.parent_id) ?? cat : cat;
  return root.quote_logo_kind ?? null;
}
