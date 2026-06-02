import type { ConsumableItem, ListConsumablesResult } from "./schema";

// 장비별 그룹 + 공용(여러 장비 매칭) 섹션으로 분류. 중복제거는 id 단위(같은 소모품은 한 번만 렌더).
// 정확히 1개 장비에만 매칭 → 그 장비 섹션 / 2개 이상 → "공용 소모품" 섹션(맨 위).
export interface ConsumableSection {
  key: string;
  title: string;
  items: ConsumableItem[];
}

export function buildSections(data: ListConsumablesResult): ConsumableSection[] {
  const memberCount = new Map<string, number>();
  for (const g of data.groups) for (const c of g.consumables) memberCount.set(c.id, (memberCount.get(c.id) ?? 0) + 1);

  const sections: ConsumableSection[] = [];
  const shared: ConsumableItem[] = [];
  const seenShared = new Set<string>();

  for (const g of data.groups) {
    const unique = g.consumables.filter((c) => (memberCount.get(c.id) ?? 0) === 1);
    for (const c of g.consumables) {
      if ((memberCount.get(c.id) ?? 0) > 1 && !seenShared.has(c.id)) {
        shared.push(c);
        seenShared.add(c.id);
      }
    }
    if (unique.length > 0) {
      sections.push({
        key: g.equipment_id ?? g.equipment_name ?? "eq",
        title: g.equipment_name ?? "기타 장비",
        items: unique,
      });
    }
  }
  if (shared.length > 0) sections.unshift({ key: "__shared__", title: "공용 소모품", items: shared });
  return sections;
}
