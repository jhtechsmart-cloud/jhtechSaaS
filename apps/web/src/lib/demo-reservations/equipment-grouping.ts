// 데모 장비 체크박스 그리드용 순수 분류 로직 — 사이드이펙트 없음.
// 각 장비의 category_id를 대분류 루트로 거슬러 quote_logo_kind(printer/cutter)로 묶는다.
// 워커 resolveLogoKind / release-orders resolveDeviceKindFromQuote와 같은 규칙(소분류면 부모 대분류 값).

import type { CategoryNode, LogoKind } from "@/lib/equipment/category-tree";
import type { EquipmentOptionRow } from "./queries";

export interface GroupedDemoEquipment {
  printer: EquipmentOptionRow[];
  cutter: EquipmentOptionRow[];
  etc: EquipmentOptionRow[]; // 미설정·분류없음·유령분류
}

/** category_id → 대분류 quote_logo_kind. 본인에 값 있으면 그 값, 없으면 부모로 거슬러. 미설정/미존재=null. */
export function resolveCategoryLogoKind(
  categoryId: string | null,
  categories: CategoryNode[],
): LogoKind | null {
  if (!categoryId) return null;
  const byId = new Map(categories.map((c) => [c.id, c]));
  let node = byId.get(categoryId);
  // 트리 깊이가 얕아도 순환·유실 대비 상한을 둔다.
  for (let depth = 0; node && depth < 8; depth += 1) {
    if (node.quote_logo_kind === "printer" || node.quote_logo_kind === "cutter") {
      return node.quote_logo_kind;
    }
    node = node.parent_id ? byId.get(node.parent_id) : undefined;
  }
  return null;
}

/** 장비 옵션을 프린터/커팅기/기타로 분류. 그룹 내 순서는 입력 순서 보존. */
export function groupDemoEquipment(
  options: EquipmentOptionRow[],
  categories: CategoryNode[],
): GroupedDemoEquipment {
  const result: GroupedDemoEquipment = { printer: [], cutter: [], etc: [] };
  for (const opt of options) {
    const kind = resolveCategoryLogoKind(opt.category_id, categories);
    if (kind === "printer") result.printer.push(opt);
    else if (kind === "cutter") result.cutter.push(opt);
    else result.etc.push(opt);
  }
  return result;
}
