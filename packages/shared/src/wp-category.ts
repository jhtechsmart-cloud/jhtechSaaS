// 장비 분류 → WP 카테고리 해석(순수). 소분류 우선, 미설정이면 조상 방향 폴백.
// resolveLogoKind 패턴 재사용 — 다중/순환 참조는 null(오연결보다 미연결이 안전).
// ⚠️ SQL 쌍둥이 = supabase/migrations/20260804183000_equipment_wp_sync.sql의 resolve_wp_category_id
//    (트리거·RPC용). 폴백 규칙을 바꾸면 반드시 양쪽을 같이 수정할 것 — db-tests가 동치 검증.

export interface WpCategoryNode {
  id: string;
  parent_id: string | null;
  wp_category_id: number | null;
}

export function resolveWpCategoryId(
  categoryId: string | null | undefined,
  nodes: WpCategoryNode[],
): number | null {
  if (!categoryId) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  let cur = byId.get(categoryId) ?? null;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.wp_category_id != null) return cur.wp_category_id;
    cur = cur.parent_id ? (byId.get(cur.parent_id) ?? null) : null;
  }
  return null;
}
