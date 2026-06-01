// 장비 사양 = 아이콘 그룹 + 항목/값 행(순서 보존). DB는 jsonb, 도메인은 SpecGroup[].
// 평면 [{label,value}](레거시 E1~E3)는 읽기 시 단일 기본그룹으로 하위호환 래핑.

export const SPEC_ICONS = [
  "gauge", "ruler", "droplet", "power", "wind", "thermometer", "weight", "box", "settings",
] as const;
export type SpecIcon = (typeof SPEC_ICONS)[number];

export interface SpecItem {
  label: string;
  value: string;
}
export interface SpecGroup {
  group: string;
  icon: SpecIcon;
  items: SpecItem[];
}

// 아이콘 값이 허용 enum에 없으면 기본값 settings로 강등
function coerceIcon(raw: unknown): SpecIcon {
  return (SPEC_ICONS as readonly string[]).includes(raw as string)
    ? (raw as SpecIcon)
    : "settings";
}

// 배열 원소를 SpecItem[] 로 변환. {label, value} 형태만 허용
function parseItems(raw: unknown): SpecItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (r): r is Record<string, unknown> =>
        typeof r === "object" && r !== null && "label" in r && "value" in r,
    )
    .map((r) => ({ label: String(r.label), value: String(r.value) }));
}

// DB jsonb(any) → SpecGroup[]. 그룹형/평면 레거시/비정형 3입력을 방어적으로 정규화.
export function parseSpecs(raw: unknown): SpecGroup[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const first = raw[0];
  // 평면 레거시: 첫 원소가 {label,value} 보유 + items 미보유 → 단일 기본그룹 래핑.
  // items 조건으로 그룹객체에 stray label이 있어도 오분류(전체 평탄화) 방지.
  if (
    typeof first === "object" &&
    first !== null &&
    "label" in first &&
    "value" in first &&
    !("items" in first)
  ) {
    return [{ group: "", icon: "settings", items: parseItems(raw) }];
  }
  // 그룹형: {group, icon, items} 구조. items 없는 비정형 원소는 제외
  return raw
    .filter((g): g is Record<string, unknown> => typeof g === "object" && g !== null && "items" in g)
    .map((g) => ({
      group: typeof g.group === "string" ? g.group : "",
      icon: coerceIcon(g.icon),
      items: parseItems(g.items),
    }));
}

// SpecGroup[] → DB 저장용. 빈 아이템 제거·트림, 아이템 0개 그룹 제거, 순서 보존.
export function serializeSpecs(groups: SpecGroup[]): SpecGroup[] {
  return groups
    .map((g) => ({
      group: g.group.trim(),
      icon: g.icon,
      items: g.items
        .map((i) => ({ label: i.label.trim(), value: i.value.trim() }))
        .filter((i) => i.label !== "" || i.value !== ""),
    }))
    .filter((g) => g.items.length > 0);
}
