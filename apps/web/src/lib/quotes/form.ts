// 견적 작성 폼 순수 로직 — 행 정리·RPC 입력 변환·실시간 합계·검증.
// 합계는 슬라이스1 calculateQuote를 그대로 쓴다(화면 미리보기). 저장 권위는 서버 RPC.
import {
  calculateQuote,
  countSpecLines,
  selectPdfSpecItems,
  specBudget,
  type QuoteInput,
  type QuoteResult,
  type SpecGroup,
} from "@jhtechsaas/shared";

// 폼 한 줄. 입력 중에는 단가·수량이 비거나 NaN일 수 있다.
// kind: 옵션 줄 구분('included'=포함옵션 스냅샷·단가 0 / 'extra'=추가 과금). 장비 줄은 미지정.
export type QuoteRow = { name: string; unitPrice: number; quantity: number; kind?: "included" | "extra"; equipmentId?: string };

// 폼에 넘기는 카탈로그(클라 직렬화 안전). 서버 listEquipmentForMatch에서 가공.
export type QuoteCatalogItem = {
  id: string;
  name: string;
  model: string | null;
  basePrice: number;
  category: string | null;
  options: { kind: "included" | "extra"; name: string }[];
  specs: SpecGroup[]; // 견적서 사양 선택 UI용(id·pdf 포함)
};

// 장비 행 — 카탈로그에서 고른 equipmentId(빈 문자열="직접 입력") + 표시명·단가·수량.
export type ItemRow = { equipmentId: string; name: string; unitPrice: number; quantity: number };

// 선택된 장비들의 포함옵션 이름 풀(중복 제거, 입력 순서 보존). equipmentId 없는 행(직접입력)은 무시.
export function availableIncludedNames(items: ItemRow[], catalog: QuoteCatalogItem[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    if (!it.equipmentId) continue;
    const eq = catalog.find((c) => c.id === it.equipmentId);
    if (!eq) continue;
    for (const o of eq.options) {
      if (o.kind === "included" && !seen.has(o.name)) {
        seen.add(o.name);
        out.push(o.name);
      }
    }
  }
  return out;
}

// 장비 행 → 저장용 견적 줄. 이름·단가는 스냅샷이되, equipmentId는 보존한다
// (PDF 워커가 이 id로 사양·로고·장비이미지를 가져옴 — 견적에서 고른 장비 기준).
// 직접입력 줄(equipmentId="")은 미포함.
export function itemRowsToLines(items: ItemRow[]): QuoteRow[] {
  return items.map((i) => ({
    name: i.name,
    unitPrice: i.unitPrice,
    quantity: i.quantity,
    ...(i.equipmentId ? { equipmentId: i.equipmentId } : {}),
  }));
}

// 포함옵션 선택(이름 목록) → 견적 옵션 줄(단가 0·수량 1·kind=included). 금액 영향 없음.
export function buildIncludedRows(names: string[]): QuoteRow[] {
  return names.map((name) => ({ name, unitPrice: 0, quantity: 1, kind: "included" as const }));
}

// 포함옵션 선택 + 추가옵션 입력 → 저장용 옵션 배열(included 먼저, extra 뒤). 추가옵션은 kind=extra 태깅.
export function buildQuoteOptions(includedNames: string[], extra: QuoteRow[]): QuoteRow[] {
  const extraTagged = cleanRows(extra).map((r) => ({ ...r, kind: "extra" as const }));
  return [...buildIncludedRows(includedNames), ...extraTagged];
}

// 미완성(빈) 행 = 이름이 비어있고 단가도 0/빈. 저장·검증에서 제외한다.
function isEmptyRow(r: QuoteRow): boolean {
  return r.name.trim() === "" && (!Number.isFinite(r.unitPrice) || r.unitPrice === 0);
}

export function cleanRows(rows: QuoteRow[]): QuoteRow[] {
  return rows.filter((r) => !isEmptyRow(r));
}

// 폼 행 → RPC 입력(정리된 행만). 서버는 items·options만 받아 금액을 재계산한다.
export function rowsToQuoteInput(items: QuoteRow[], options: QuoteRow[]): QuoteInput {
  return { items: cleanRows(items), options: cleanRows(options) };
}

// 실시간 합계 — 입력 중 NaN/빈 값은 0으로 취급해 미리보기가 깨지지 않게 한다.
function coerce(r: QuoteRow): QuoteRow {
  return {
    name: r.name,
    unitPrice: Number.isFinite(r.unitPrice) ? r.unitPrice : 0,
    quantity: Number.isFinite(r.quantity) ? r.quantity : 0,
  };
}

export function previewTotals(items: QuoteRow[], options: QuoteRow[]): QuoteResult {
  return calculateQuote({ items: items.map(coerce), options: options.map(coerce) });
}

// 폼 상태(장비행·추가옵션·해제된 포함옵션)에서 실시간 합계 계산.
// QuoteLinesEditor에 인라인이던 계산을 폼 상단으로 끌어올려 합계 패널과 공유한다.
export function formPreviewTotals(
  items: ItemRow[],
  options: QuoteRow[],
  includedDeselected: string[],
  catalog: QuoteCatalogItem[],
): QuoteResult {
  const checkedIncluded = availableIncludedNames(items, catalog).filter((n) => !includedDeselected.includes(n));
  return previewTotals(itemRowsToLines(items), buildQuoteOptions(checkedIncluded, options));
}

// 저장된 견적 줄(jsonb) → 폼 행. 재발행 프리필용. 깨진 값은 안전 기본으로 코어스(방어).
export function parseQuoteLines(value: unknown): QuoteRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((e) => {
    const o = (e ?? {}) as Record<string, unknown>;
    const kind = o.kind === "included" || o.kind === "extra" ? o.kind : undefined;
    const equipmentId = typeof o.equipmentId === "string" && o.equipmentId ? o.equipmentId : undefined;
    return {
      name: typeof o.name === "string" ? o.name : "",
      unitPrice: typeof o.unitPrice === "number" && Number.isFinite(o.unitPrice) ? o.unitPrice : 0,
      quantity: typeof o.quantity === "number" && Number.isFinite(o.quantity) ? o.quantity : 0,
      ...(kind ? { kind } : {}),
      ...(equipmentId ? { equipmentId } : {}),
    };
  });
}

// 저장 전 검증 — 에러 메시지(한국어) 또는 null. 정리된 행 기준.
export function validateQuoteForm(items: QuoteRow[], options: QuoteRow[]): string | null {
  const cleanItems = cleanRows(items);
  if (cleanItems.length === 0) {
    return "장비를 최소 한 줄 입력하세요.";
  }
  for (const r of [...cleanItems, ...cleanRows(options)]) {
    if (r.name.trim() === "") {
      return "이름을 입력하세요.";
    }
    if (!Number.isInteger(r.unitPrice)) {
      return "단가는 정수(원)여야 합니다.";
    }
    if (!Number.isInteger(r.quantity) || r.quantity < 1) {
      return "수량은 1 이상 정수여야 합니다.";
    }
  }
  return null;
}

// 견적 메인 장비(첫 카탈로그 장비행)의 사양 — 워커의 items[0] 기준과 일치. 직접입력만이면 [].
export function mainEquipmentSpecs(items: ItemRow[], catalog: QuoteCatalogItem[]): SpecGroup[] {
  for (const it of items) {
    if (!it.equipmentId) continue;
    const eq = catalog.find((c) => c.id === it.equipmentId);
    if (eq) return eq.specs;
  }
  return [];
}

// 사양 선택 예산 — 현재 품목·옵션 기준 max 줄, 선택(specSelection)이 차지하는 used 줄, 초과 여부.
export function specSelectionBudget(
  items: ItemRow[],
  options: QuoteRow[],
  includedDeselected: string[],
  catalog: QuoteCatalogItem[],
  specSelection: string[],
): { max: number; used: number; over: boolean } {
  const includedCount = availableIncludedNames(items, catalog).filter((n) => !includedDeselected.includes(n)).length;
  const extraCount = cleanRows(options).length;
  const itemCount = items.filter((i) => i.name.trim() !== "" || i.equipmentId).length;
  const max = specBudget({ itemCount, includedCount, extraCount });
  const selectedGroups = selectPdfSpecItems(mainEquipmentSpecs(items, catalog), specSelection);
  const used = countSpecLines(selectedGroups);
  return { max, used, over: used > max };
}
