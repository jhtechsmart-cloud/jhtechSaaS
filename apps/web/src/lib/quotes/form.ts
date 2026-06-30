// 견적 작성 폼 순수 로직 — 행 정리·RPC 입력 변환·실시간 합계·검증.
// 합계는 슬라이스1 calculateQuote를 그대로 쓴다(화면 미리보기). 저장 권위는 서버 RPC.
//
// [포함옵션 모델] 장비마다 포함옵션(이름+가격)을 갖는다. 저장 시 포함옵션은
// kind='included'·equipmentId·quantity=장비수량으로 평탄화 → 공급가 = Σ(기본가+포함옵션)×수량이
// 평탄 합산만으로 자동 성립(계산 엔진·RPC 무변경). '추가옵션(extra)'은 신규 견적에서 제거(구 견적 표시 호환).
import {
  calculateQuote,
  countSpecLines,
  matchEquipmentName,
  selectPdfSpecItems,
  specBudget,
  type QuoteInput,
  type QuoteResult,
  type SpecGroup,
} from "@jhtechsaas/shared";

// 폼 한 줄. 입력 중에는 단가·수량이 비거나 NaN일 수 있다.
// kind: 옵션 줄 구분('included'=포함옵션 / 'extra'=구 견적 추가옵션). 장비 줄은 미지정.
export type QuoteRow = { name: string; unitPrice: number; quantity: number; kind?: "included" | "extra"; equipmentId?: string; remark?: string };

// 장비별 포함옵션 한 줄 — 이름 + 가격(원). 폼에서 직접 편집.
export type IncludedRow = { name: string; price: number };

// 폼에 넘기는 카탈로그(클라 직렬화 안전). 서버 listEquipmentForMatch에서 가공.
// options = 장비의 포함옵션(이름+가격). 장비 선택 시 그대로 프리필된다.
export type QuoteCatalogItem = {
  id: string;
  name: string;
  model: string | null;
  basePrice: number;
  category: string | null;
  options: { name: string; price: number }[];
  specs: SpecGroup[]; // 견적서 사양 선택 UI용(id·pdf 포함)
};

// 장비 행 — 카탈로그에서 고른 equipmentId(빈 문자열="직접 입력") + 표시명·기본가·수량 + 포함옵션.
export type ItemRow = {
  equipmentId: string;
  name: string;
  unitPrice: number; // 기본가(영업이 '장비 가격'에 입력)
  quantity: number;
  remark?: string;
  included: IncludedRow[]; // 이 장비의 포함옵션
};

// 카탈로그 장비의 포함옵션(이름+가격) 프리필값.
export function catalogIncluded(catalog: QuoteCatalogItem[], equipmentId: string): IncludedRow[] {
  const eq = catalog.find((c) => c.id === equipmentId);
  return eq ? eq.options.map((o) => ({ name: o.name, price: Number.isFinite(o.price) ? o.price : 0 })) : [];
}

// 빈 포함옵션(이름 비고 가격 0/NaN) 제거.
function cleanIncluded(rows: IncludedRow[]): IncludedRow[] {
  return rows.filter((r) => r.name.trim() !== "");
}

// 장비 1대의 최종 단가 = 기본가 + Σ포함옵션 가격(읽기전용 표시·PDF 장비줄 금액).
export function itemFinalUnit(item: ItemRow): number {
  const base = Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
  return base + cleanIncluded(item.included).reduce((s, o) => s + (Number.isFinite(o.price) ? o.price : 0), 0);
}

// 장비 행 → 저장용 견적 줄(기본가 스냅샷 + equipmentId 보존). 직접입력 줄(equipmentId="")도 보존.
export function itemRowsToLines(items: ItemRow[]): QuoteRow[] {
  return items.map((i) => ({
    name: i.name,
    unitPrice: i.unitPrice,
    quantity: i.quantity,
    ...(i.equipmentId ? { equipmentId: i.equipmentId } : {}),
    ...(i.remark && i.remark.trim() ? { remark: i.remark.trim() } : {}),
  }));
}

// 장비들의 포함옵션 → 저장용 옵션 줄(kind=included·단가=옵션가격·수량=장비수량·equipmentId).
// 수량을 장비수량과 맞춰 평탄 합산만으로 공급가 = Σ(기본가+포함옵션)×수량이 성립한다.
export function itemsToIncludedOptions(items: ItemRow[]): QuoteRow[] {
  const out: QuoteRow[] = [];
  for (const it of items) {
    for (const o of cleanIncluded(it.included)) {
      out.push({
        name: o.name,
        unitPrice: Number.isFinite(o.price) ? o.price : 0,
        quantity: it.quantity,
        kind: "included" as const,
        ...(it.equipmentId ? { equipmentId: it.equipmentId } : {}),
      });
    }
  }
  return out;
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

// 폼 상태(장비행+포함옵션)에서 실시간 합계 계산. 공급가 = Σ(기본가+포함옵션)×수량.
export function formPreviewTotals(items: ItemRow[]): QuoteResult {
  return previewTotals(itemRowsToLines(items), itemsToIncludedOptions(items));
}

// 저장된 견적 줄(jsonb) → 폼 행. 재발행 프리필용. 깨진 값은 안전 기본으로 코어스(방어).
export function parseQuoteLines(value: unknown): QuoteRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((e) => {
    const o = (e ?? {}) as Record<string, unknown>;
    const kind = o.kind === "included" || o.kind === "extra" ? o.kind : undefined;
    const equipmentId = typeof o.equipmentId === "string" && o.equipmentId ? o.equipmentId : undefined;
    const remark = typeof o.remark === "string" && o.remark.trim() ? o.remark : undefined;
    return {
      name: typeof o.name === "string" ? o.name : "",
      unitPrice: typeof o.unitPrice === "number" && Number.isFinite(o.unitPrice) ? o.unitPrice : 0,
      quantity: typeof o.quantity === "number" && Number.isFinite(o.quantity) ? o.quantity : 0,
      ...(kind ? { kind } : {}),
      ...(equipmentId ? { equipmentId } : {}),
      ...(remark ? { remark } : {}),
    };
  });
}

// 초기 장비행 구성 — 새 견적(카탈로그 기본 포함옵션 프리필)·재발행(저장된 포함옵션 복원) 공용.
// initialOptions === undefined → 새 견적: 해석된 장비의 카탈로그 포함옵션을 채운다.
// initialOptions 있음 → 재발행: 저장된 included 옵션을 equipmentId로 귀속(없으면 첫 장비, 구 견적 호환).
// 구 extra 옵션은 무시(추가옵션 개념 제거). equipmentId 없으면 이름매칭으로 복원(구 견적).
export function buildInitialItemRows(
  initialItems: QuoteRow[] | undefined,
  initialOptions: QuoteRow[] | undefined,
  catalog: QuoteCatalogItem[],
): ItemRow[] {
  if (!initialItems || initialItems.length === 0) {
    return [{ equipmentId: "", name: "", unitPrice: 0, quantity: 1, included: [] }];
  }
  const rows: ItemRow[] = initialItems.map((it) => {
    const byId = it.equipmentId ? catalog.find((c) => c.id === it.equipmentId) : undefined;
    const eq = byId ?? matchEquipmentName(it.name, catalog);
    return {
      equipmentId: eq?.id ?? "",
      name: it.name,
      unitPrice: it.unitPrice,
      quantity: it.quantity,
      ...(it.remark ? { remark: it.remark } : {}),
      included: [] as IncludedRow[],
    };
  });
  if (initialOptions === undefined) {
    for (const r of rows) r.included = catalogIncluded(catalog, r.equipmentId);
    return rows;
  }
  for (const o of initialOptions.filter((x) => x.kind === "included")) {
    const idx = o.equipmentId ? rows.findIndex((r) => r.equipmentId === o.equipmentId) : -1;
    const target = idx >= 0 ? rows[idx] : rows[0];
    if (target) target.included.push({ name: o.name, price: o.unitPrice });
  }
  return rows;
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
// 항목 이름(라벨)·값이 모두 있는 항목만(PDF 미포함 규칙과 동일) — 선택 UI·예산·기본선택 모두 일관되게.
export function mainEquipmentSpecs(items: ItemRow[], catalog: QuoteCatalogItem[]): SpecGroup[] {
  for (const it of items) {
    if (!it.equipmentId) continue;
    const eq = catalog.find((c) => c.id === it.equipmentId);
    if (eq) {
      return eq.specs
        .map((g) => ({ ...g, items: g.items.filter((i) => i.label.trim() !== "" && i.value.trim() !== "") }))
        .filter((g) => g.items.length > 0);
    }
  }
  return [];
}

// 사양 선택 예산 — 현재 품목·옵션 기준 max 줄, 선택(specSelection)이 차지하는 used 줄, 초과 여부.
export function specSelectionBudget(
  items: ItemRow[],
  catalog: QuoteCatalogItem[],
  specSelection: string[],
): { max: number; used: number; over: boolean } {
  const includedCount = items.reduce((s, it) => s + cleanIncluded(it.included).length, 0);
  const itemCount = items.filter((i) => i.name.trim() !== "" || i.equipmentId).length;
  const max = specBudget({ itemCount, includedCount, extraCount: 0 });
  const selectedGroups = selectPdfSpecItems(mainEquipmentSpecs(items, catalog), specSelection);
  const used = countSpecLines(selectedGroups);
  return { max, used, over: used > max };
}
