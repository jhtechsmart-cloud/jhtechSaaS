// 장비 사양 = 아이콘 그룹 + 항목/값 행(순서 보존). DB는 jsonb, 도메인은 SpecGroup[].
// 평면 [{label,value}](레거시 E1~E3)는 읽기 시 단일 기본그룹으로 하위호환 래핑.

export const SPEC_ICONS = [
  "gauge", "ruler", "droplet", "power", "wind", "thermometer", "weight", "box", "settings",
] as const;
export type SpecIcon = (typeof SPEC_ICONS)[number];

export interface SpecItem {
  id: string; // 안정 고유표식 — 견적 spec_selection이 이 id로 항목을 가리킨다(레거시는 빈 문자열, serialize 시 채움)
  label: string;
  value: string;
  pdf?: boolean; // 견적서 PDF 기본 포함 여부(장비 기본값). 견적별 가감은 quotes.spec_selection.
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

// 배열 원소를 SpecItem[] 로 변환. {label, value} 형태만 허용. id·pdf는 있으면 보존.
function parseItems(raw: unknown): SpecItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (r): r is Record<string, unknown> =>
        typeof r === "object" && r !== null && "label" in r && "value" in r,
    )
    .map((r) => ({
      id: typeof r.id === "string" ? r.id : "",
      label: String(r.label),
      value: String(r.value),
      ...(typeof r.pdf === "boolean" ? { pdf: r.pdf } : {}),
    }));
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

// 결정적이지 않은 id 생성. crypto.randomUUID 사용(노드·브라우저·워커 공통).
export function genSpecItemId(): string {
  return crypto.randomUUID();
}

// SpecGroup[] → DB 저장용. 빈 아이템 제거·트림, 아이템 0개 그룹 제거, 순서 보존.
// id 없는 항목엔 id 부여(연결 안정성), pdf 플래그 보존.
export function serializeSpecs(groups: SpecGroup[]): SpecGroup[] {
  return groups
    .map((g) => ({
      group: g.group.trim(),
      icon: g.icon,
      items: g.items
        .map((i) => ({
          id: i.id && i.id.length > 0 ? i.id : genSpecItemId(),
          label: i.label.trim(),
          value: i.value.trim(),
          ...(typeof i.pdf === "boolean" ? { pdf: i.pdf } : {}),
        }))
        .filter((i) => i.label !== "" || i.value !== ""),
    }))
    .filter((g) => g.items.length > 0);
}

// 견적 PDF에 렌더할 사양 항목만 거른다. 빈 그룹은 제거.
// 폴백: 배열이면 그 id만 / null이면 pdf:true만(없으면 전체=현 동작).
export function selectPdfSpecItems(
  groups: SpecGroup[],
  specSelection: string[] | null | undefined,
): SpecGroup[] {
  if (Array.isArray(specSelection)) {
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => specSelection.includes(i.id)) }))
      .filter((g) => g.items.length > 0);
  }
  // null/undefined = 구 견적: pdf:true 항목만, 하나도 없으면 전체.
  const anyFlagged = groups.some((g) => g.items.some((i) => i.pdf === true));
  return groups
    .map((g) => ({ ...g, items: anyFlagged ? g.items.filter((i) => i.pdf === true) : g.items }))
    .filter((g) => g.items.length > 0);
}

// 폼 새 견적 기본 선택 = pdf:true 항목 id들. flagged 없으면 전체 id(미설정 장비 = 현 동작 유지).
export function defaultSpecSelection(groups: SpecGroup[]): string[] {
  const flagged = groups.flatMap((g) => g.items.filter((i) => i.pdf === true).map((i) => i.id));
  if (flagged.length > 0) return flagged;
  return groups.flatMap((g) => g.items.map((i) => i.id));
}
