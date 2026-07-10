// 견적 작성 폼 순수 로직 — 새 옵션 모델.
// 포함옵션: unitPrice=0(합계 미반영)·수량(PDF 헤드 표시용)·refPrice(참고단가 보존). 자동 프리필 없음.
// 공급가 = Σ(기본공급가×수량) + Σ(추가옵션 단가×수량).
import { describe, expect, test } from "vitest";
import { calculateQuote } from "@jhtechsaas/shared";
import {
  buildExtraOptions,
  buildInitialItemRows,
  buildQuoteOptions,
  cleanRows,
  formBreakdown,
  formPreviewTotals,
  itemFinalUnit,
  itemRowsToLines,
  itemsToIncludedOptions,
  mainEquipmentSpecs,
  parseQuoteLines,
  previewTotals,
  rowsToQuoteInput,
  specSelectionBudget,
  validateQuoteForm,
  type ItemRow,
  type QuoteCatalogItem,
  type QuoteRow,
} from "./form";

const row = (name: string, unitPrice: number, quantity: number): QuoteRow => ({ name, unitPrice, quantity });
const item = (over: Partial<ItemRow> = {}): ItemRow => ({ equipmentId: "", name: "", unitPrice: 0, quantity: 1, included: [], ...over });

const catalog: QuoteCatalogItem[] = [
  { id: "jp", name: "JP1113", model: "JP1113", basePrice: 48_000_000, category: "평판커팅기", image: null, specs: [],
    options: [{ name: "자동 급지", price: 1_200_000 }, { name: "안전 센서", price: 0 }] },
  { id: "uv", name: "UV3300S", model: "UV-3300S", basePrice: 50_000_000, category: "평판커팅기", image: null, specs: [],
    options: [{ name: "집진 장치", price: 800_000 }] },
];

describe("cleanRows — 미완성(빈) 행 제거", () => {
  test("이름 비고 단가 0인 행은 버림, 의미있는 행은 유지", () => {
    const rows = [row("UV3300S", 50_000_000, 1), row("", 0, 1), row("할인", -1_000_000, 1)];
    expect(cleanRows(rows)).toEqual([row("UV3300S", 50_000_000, 1), row("할인", -1_000_000, 1)]);
  });
});

describe("비고(remark) 보존 — itemRowsToLines·parseQuoteLines", () => {
  test("장비 줄 비고는 trim 후 보존, 빈 비고는 생략", () => {
    const lines = itemRowsToLines([
      item({ equipmentId: "eq1", name: "커팅기", unitPrice: 1, remark: "  설치 포함  " }),
      item({ name: "직접", unitPrice: 1, remark: "   " }),
    ]);
    expect(lines[0]).toEqual({ name: "커팅기", unitPrice: 1, quantity: 1, equipmentId: "eq1", remark: "설치 포함" });
    expect(lines[1]).toEqual({ name: "직접", unitPrice: 1, quantity: 1 });
  });
});

describe("itemFinalUnit — 장비 단가 = 기본공급가(포함옵션 미반영)", () => {
  test("포함옵션 가격은 최종가에 안 더해짐", () => {
    const it = item({ equipmentId: "jp", unitPrice: 48_000_000, included: [{ name: "자동 급지", quantity: 1, price: 1_200_000 }] });
    expect(itemFinalUnit(it)).toBe(48_000_000);
  });
});

describe("itemsToIncludedOptions — 포함옵션 → 저장용 옵션 줄", () => {
  test("unitPrice=0·수량 보존·refPrice(참고단가)·equipmentId", () => {
    const it = item({ equipmentId: "jp", name: "JP", unitPrice: 48_000_000, quantity: 1, included: [{ name: "프린트헤드", quantity: 2, price: 1_200_000 }] });
    expect(itemsToIncludedOptions([it])).toEqual([
      { name: "프린트헤드", unitPrice: 0, quantity: 2, kind: "included", refPrice: 1_200_000, equipmentId: "jp" },
    ]);
  });
  test("참고단가 0이면 refPrice 생략", () => {
    const it = item({ equipmentId: "jp", name: "JP", unitPrice: 1, included: [{ name: "안전 센서", quantity: 1, price: 0 }] });
    expect(itemsToIncludedOptions([it])).toEqual([
      { name: "안전 센서", unitPrice: 0, quantity: 1, kind: "included", equipmentId: "jp" },
    ]);
  });
  test("이름 빈 포함옵션은 제거", () => {
    const it = item({ equipmentId: "jp", name: "JP", unitPrice: 1, included: [{ name: "  ", quantity: 1, price: 5 }] });
    expect(itemsToIncludedOptions([it])).toEqual([]);
  });
  test("itemRowsToLines — equipmentId 보존, 포함옵션은 미포함(별도 옵션 줄)", () => {
    const it = item({ equipmentId: "jp", name: "JP1113", unitPrice: 48_000_000, included: [{ name: "자동 급지", quantity: 1, price: 1_200_000 }] });
    expect(itemRowsToLines([it])).toEqual([{ name: "JP1113", unitPrice: 48_000_000, quantity: 1, equipmentId: "jp" }]);
  });
});

describe("포함옵션 가격은 공급가에 미반영(핵심)", () => {
  test("공급가 = 기본공급가만(포함옵션 가격 무시)", () => {
    const items = [item({ equipmentId: "uv", name: "UV3300S", unitPrice: 50_000_000, quantity: 1, included: [{ name: "집진 장치", quantity: 1, price: 800_000 }] })];
    const r = formPreviewTotals(items, []);
    expect(r.supplyPrice).toBe(50_000_000); // 포함옵션 800,000은 안 더해짐
    expect(r.taxPrice).toBe(5_000_000);
    expect(r.total).toBe(55_000_000);
  });
  test("수량 2면 기본공급가×2(포함옵션 무관)", () => {
    const items = [item({ equipmentId: "uv", name: "UV3300S", unitPrice: 50_000_000, quantity: 2, included: [{ name: "집진 장치", quantity: 3, price: 800_000 }] })];
    expect(formPreviewTotals(items, []).supplyPrice).toBe(100_000_000);
  });
  test("빈/NaN 입력은 0으로 처리(공급가 0)", () => {
    expect(formPreviewTotals([item({ unitPrice: Number.NaN, quantity: Number.NaN })], []).supplyPrice).toBe(0);
  });
});

describe("formBreakdown — 우측 합계 박스 소계 분해", () => {
  test("장비 소계 = Σ(기본공급가×수량), 옵션 소계 = Σ추가옵션", () => {
    const items: ItemRow[] = [item({ equipmentId: "uv", name: "UV3300S", unitPrice: 50_000_000, quantity: 2, included: [{ name: "집진 장치", quantity: 1, price: 800_000 }] })];
    const extra: QuoteRow[] = [row("추가 헤드", 1_500_000, 1)];
    const b = formBreakdown(items, extra);
    expect(b.equipmentSubtotal).toBe(100_000_000); // 포함옵션 미반영
    expect(b.optionSubtotal).toBe(1_500_000);
    expect(b.equipmentSubtotal + b.optionSubtotal).toBe(formPreviewTotals(items, extra).supplyPrice);
  });
  test("이름·id 없는 빈 장비행·빈 추가옵션은 라인에서 제외", () => {
    const items: ItemRow[] = [item({ name: "", unitPrice: 0, quantity: 1 })];
    const b = formBreakdown(items, [row("", 0, 1)]);
    expect(b.itemLines).toEqual([]);
    expect(b.optionLines).toEqual([]);
    expect(b.equipmentSubtotal).toBe(0);
    expect(b.optionSubtotal).toBe(0);
  });
});

describe("추가옵션(extra) — 포함옵션과 별개 과금", () => {
  test("buildExtraOptions: 빈 행 제거 + kind=extra 태깅 + 비고 보존", () => {
    expect(buildExtraOptions([{ name: "연장 보증", unitPrice: 1_500_000, quantity: 1, remark: "2년" }, { name: "", unitPrice: 0, quantity: 1 }])).toEqual([
      { name: "연장 보증", unitPrice: 1_500_000, quantity: 1, kind: "extra", remark: "2년" },
    ]);
  });
  test("buildQuoteOptions: 포함옵션(included·단가0) 먼저, 추가옵션(extra) 뒤", () => {
    const items = [item({ equipmentId: "uv", name: "UV", unitPrice: 50_000_000, quantity: 1, included: [{ name: "집진", quantity: 1, price: 800_000 }] })];
    const opts = buildQuoteOptions(items, [{ name: "연장 보증", unitPrice: 1_500_000, quantity: 1 }]);
    expect(opts[0]).toMatchObject({ name: "집진", kind: "included", unitPrice: 0, refPrice: 800_000, equipmentId: "uv" });
    expect(opts[1]).toMatchObject({ name: "연장 보증", kind: "extra", unitPrice: 1_500_000 });
  });
  test("공급가 = 기본공급가 + 추가옵션(포함옵션 무관)", () => {
    const items = [item({ equipmentId: "uv", name: "UV", unitPrice: 50_000_000, quantity: 1, included: [{ name: "집진", quantity: 1, price: 800_000 }] })];
    const extra: QuoteRow[] = [{ name: "연장 보증", unitPrice: 1_500_000, quantity: 1 }];
    expect(formPreviewTotals(items, extra).supplyPrice).toBe(51_500_000); // 50,000,000 + 1,500,000
  });
});

describe("previewTotals — 실시간 합계(calculateQuote와 일치)", () => {
  test("50M + 2.5M×2 → 공급가 55M", () => {
    const items = [row("UV3300S", 50_000_000, 1)];
    const options = [row("프린트헤드", 2_500_000, 2)];
    expect(previewTotals(items, options)).toEqual(calculateQuote({ items, options }));
    expect(previewTotals(items, options).total).toBe(60_500_000);
  });
});

describe("rowsToQuoteInput — 폼 행 → RPC 입력(정리된 행만)", () => {
  test("빈 행을 빼고 items·options 구성", () => {
    const input = rowsToQuoteInput([row("UV3300S", 50_000_000, 1), row("", 0, 1)], [row("프린트헤드", 2_500_000, 2)]);
    expect(input).toEqual({
      items: [{ name: "UV3300S", unitPrice: 50_000_000, quantity: 1 }],
      options: [{ name: "프린트헤드", unitPrice: 2_500_000, quantity: 2 }],
    });
  });
});

describe("parseQuoteLines — 저장된 jsonb → 폼 행", () => {
  test("kind·equipmentId·refPrice 보존, 잘못된 kind는 무시", () => {
    expect(parseQuoteLines([{ name: "프린트헤드", unitPrice: 0, quantity: 2, kind: "included", equipmentId: "jp", refPrice: 1_200_000 }])).toEqual([
      { name: "프린트헤드", unitPrice: 0, quantity: 2, kind: "included", equipmentId: "jp", refPrice: 1_200_000 },
    ]);
    expect(parseQuoteLines([{ name: "x", unitPrice: 1, quantity: 1, kind: "weird" }])).toEqual([row("x", 1, 1)]);
  });
  test("배열이 아니면 빈 배열", () => {
    expect(parseQuoteLines(null)).toEqual([]);
  });
});

describe("buildInitialItemRows — 신규/재발행 프리필", () => {
  test("신규(initialOptions 없음): 포함옵션 자동 프리필 안 함(빈 배열)", () => {
    const rows = buildInitialItemRows([{ name: "JP1113", unitPrice: 48_000_000, quantity: 1, equipmentId: "jp" }], undefined, catalog);
    expect(rows[0].included).toEqual([]);
  });
  test("재발행: 저장된 포함옵션을 수량·refPrice(참고단가)로 복원", () => {
    const rows = buildInitialItemRows(
      [{ name: "JP1113", unitPrice: 48_000_000, quantity: 1, equipmentId: "jp" }],
      [{ name: "자동 급지", unitPrice: 0, quantity: 3, kind: "included", equipmentId: "jp", refPrice: 1_300_000 }],
      catalog,
    );
    expect(rows[0].included).toEqual([{ name: "자동 급지", quantity: 3, price: 1_300_000 }]);
  });
  test("구 견적(refPrice 없음): unitPrice를 참고단가로 폴백", () => {
    const rows = buildInitialItemRows(
      [{ name: "JP1113", unitPrice: 48_000_000, quantity: 1, equipmentId: "jp" }],
      [{ name: "옛 포함옵션", unitPrice: 1_200_000, quantity: 1, kind: "included" }],
      catalog,
    );
    expect(rows[0].included).toEqual([{ name: "옛 포함옵션", quantity: 1, price: 1_200_000 }]);
  });
  test("초기값 없으면 빈 장비행 1개(included 빈 배열)", () => {
    expect(buildInitialItemRows(undefined, undefined, catalog)).toEqual([{ equipmentId: "", name: "", unitPrice: 0, quantity: 1, included: [] }]);
  });
});

describe("validateQuoteForm — 저장 전 검증", () => {
  test("유효하면 null", () => {
    expect(validateQuoteForm([row("UV3300S", 50_000_000, 1)], [])).toBeNull();
  });
  test("장비 0줄이면 에러", () => {
    expect(validateQuoteForm([], [row("옵션", 1000, 1)])).toMatch(/장비/);
  });
  test("이름 빈 줄·수량0·단가소수면 에러", () => {
    expect(validateQuoteForm([row("  ", 1000, 1)], [])).toMatch(/이름/);
    expect(validateQuoteForm([row("장비", 1000, 0)], [])).toMatch(/수량/);
    expect(validateQuoteForm([row("장비", 1000.5, 1)], [])).toMatch(/단가/);
  });
});

const SPEC_CAT: QuoteCatalogItem[] = [{
  id: "eq1", name: "프린터A", model: null, basePrice: 1000, category: null, image: null, options: [],
  specs: [{ group: "성능", icon: "gauge", items: [
    { id: "s1", label: "속도", value: "30", pdf: true },
    { id: "s2", label: "해상도", value: "1200", pdf: true },
  ] }],
}];

describe("mainEquipmentSpecs / specSelectionBudget", () => {
  test("첫 카탈로그 장비행의 사양을 반환", () => {
    const items = [item({ equipmentId: "eq1", name: "프린터A", unitPrice: 1000 })];
    expect(mainEquipmentSpecs(items, SPEC_CAT)[0]!.items.map((i) => i.id)).toEqual(["s1", "s2"]);
  });
  test("specSelectionBudget — max·used·over 계산", () => {
    const items = [item({ equipmentId: "eq1", name: "프린터A", unitPrice: 1000 })];
    const r = specSelectionBudget(items, [], SPEC_CAT, ["s1", "s2"]);
    expect(r.max).toBeGreaterThan(0);
    expect(r.used).toBe(2);
    expect(typeof r.over).toBe("boolean");
  });
});
