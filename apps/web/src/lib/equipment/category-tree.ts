// 분류 트리 순수 로직 — 사이드이펙트 없음. 드롭다운 옵션 구성에 사용.
export type LogoKind = "cutter" | "printer";

export interface CategoryNode {
  id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  // 견적서 PDF 좌상단 회사로고 종류(대분류에만 의미). null/미설정 = 기본 로고.
  quote_logo_kind?: LogoKind | null;
}

export interface CategoryTreeNode extends CategoryNode {
  children: CategoryNode[];
}

export interface OptGroup {
  group: string | null; // 대분류 헤더(자식있는 대분류) / null = 그룹없는 단독
  options: { id: string; name: string }[];
}

const bySort = (a: CategoryNode, b: CategoryNode) =>
  a.sort_order - b.sort_order || a.name.localeCompare(b.name);

// 대분류(parent_id null)별로 children 묶은 트리. 대분류·children 각각 정렬.
export function buildTree(nodes: CategoryNode[]): CategoryTreeNode[] {
  const tops = nodes.filter((n) => n.parent_id === null).sort(bySort);
  return tops.map((t) => ({
    ...t,
    children: nodes.filter((n) => n.parent_id === t.id).sort(bySort),
  }));
}

// 장비 부착용: 자식 있는 대분류는 그룹헤더(비선택), 자식 = 옵션. 자식 없는 대분류 = 단독 옵션.
export function equipmentSelectableOptions(nodes: CategoryNode[]): OptGroup[] {
  const tree = buildTree(nodes);
  const groups: OptGroup[] = [];
  const standalone: { id: string; name: string }[] = [];

  for (const t of tree) {
    if (t.children.length > 0) {
      groups.push({
        group: t.name,
        options: t.children.map((c) => ({ id: c.id, name: c.name })),
      });
    } else {
      standalone.push({ id: t.id, name: t.name });
    }
  }

  if (standalone.length) groups.push({ group: null, options: standalone });
  return groups;
}

// 소모품 범위용: 대분류(공통)도 선택 가능. 자식있는 대분류 = "X 공통" + 그 자식들. 자식없는 대분류 = "X 공통" 단독.
export function scopeSelectableOptions(nodes: CategoryNode[]): OptGroup[] {
  const tree = buildTree(nodes);
  const groups: OptGroup[] = [];
  const standalone: { id: string; name: string }[] = [];

  for (const t of tree) {
    if (t.children.length > 0) {
      groups.push({
        group: t.name,
        options: [
          { id: t.id, name: `${t.name} 공통` },
          ...t.children.map((c) => ({ id: c.id, name: c.name })),
        ],
      });
    } else {
      standalone.push({ id: t.id, name: `${t.name} 공통` });
    }
  }

  if (standalone.length) groups.push({ group: null, options: standalone });
  return groups;
}
