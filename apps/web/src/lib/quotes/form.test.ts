// 견적 작성 폼 순수 로직 — non-server, 서버 모킹 불필요. 합계는 슬라이스1 calculateQuote와 일치해야 한다.
import { describe, expect, test } from "vitest";
import { calculateQuote } from "@jhtechsaas/shared";
import {
  availableIncludedNames,
  buildIncludedRows,
  buildQuoteOptions,
  cleanRows,
  formPreviewTotals,
  itemRowsToLines,
  parseQuoteLines,
  previewTotals,
  rowsToQuoteInput,
  validateQuoteForm,
  mainEquipmentSpecs,
  specSelectionBudget,
  type ItemRow,
  type QuoteCatalogItem,
  type QuoteRow,
} from "./form";

const row = (name: string, unitPrice: number, quantity: number): QuoteRow => ({ name, unitPrice, quantity });

describe("cleanRows — 미완성(빈) 행 제거", () => {
  test("이름 비고 단가 0인 행은 버림, 의미있는 행은 유지", () => {
    const rows = [row("UV3300S", 50_000_000, 1), row("", 0, 1), row("할인", -1_000_000, 1)];
    expect(cleanRows(rows)).toEqual([row("UV3300S", 50_000_000, 1), row("할인", -1_000_000, 1)]);
  });
});

describe("비고(remark) 보존 — itemRowsToLines·buildQuoteOptions·parseQuoteLines", () => {
  test("장비 줄 비고는 trim 후 보존, 빈 비고는 생략", () => {
    const lines = itemRowsToLines([
      { equipmentId: "eq1", name: "커팅기", unitPrice: 1, quantity: 1, remark: "  설치 포함  " },
      { equipmentId: "", name: "직접", unitPrice: 1, quantity: 1, remark: "   " },
    ]);
    expect(lines[0]).toEqual({ name: "커팅기", unitPrice: 1, quantity: 1, equipmentId: "eq1", remark: "설치 포함" });
    expect(lines[1]).toEqual({ name: "직접", unitPrice: 1, quantity: 1 }); // 빈 비고 생략
  });
  test("추가옵션 비고는 보존, 포함옵션엔 비고 없음", () => {
    const opts = buildQuoteOptions(["기본칼날"], [{ name: "칼날", unitPrice: 1, quantity: 1, remark: "소모품" }]);
    const included = opts.find((o) => o.kind === "included");
    const extra = opts.find((o) => o.kind === "extra");
    expect(included).toEqual({ name: "기본칼날", unitPrice: 0, quantity: 1, kind: "included" });
    expect(extra).toEqual({ name: "칼날", unitPrice: 1, quantity: 1, kind: "extra", remark: "소모품" });
  });
  test("parseQuoteLines는 저장된 비고를 복원(재발행 프리필)", () => {
    const rows = parseQuoteLines([
      { name: "커팅기", unitPrice: 1, quantity: 1, remark: "설치 포함" },
      { name: "옵션", unitPrice: 1, quantity: 1 },
    ]);
    expect(rows[0].remark).toBe("설치 포함");
    expect(rows[1].remark).toBeUndefined();
  });
});

describe("rowsToQuoteInput — 폼 행 → RPC 입력(정리된 행만)", () => {
  test("빈 행을 빼고 items·options 구성", () => {
    const input = rowsToQuoteInput(
      [row("UV3300S", 50_000_000, 1), row("", 0, 1)],
      [row("프린트헤드", 2_500_000, 2)],
    );
    expect(input).toEqual({
      items: [{ name: "UV3300S", unitPrice: 50_000_000, quantity: 1 }],
      options: [{ name: "프린트헤드", unitPrice: 2_500_000, quantity: 2 }],
    });
  });
});

describe("previewTotals — 실시간 합계(calculateQuote와 일치)", () => {
  test("50M + 2.5M×2 → 공급가 55M·세액 5.5M·합계 60.5M", () => {
    const items = [row("UV3300S", 50_000_000, 1)];
    const options = [row("프린트헤드", 2_500_000, 2)];
    expect(previewTotals(items, options)).toEqual(
      calculateQuote({ items, options }),
    );
    expect(previewTotals(items, options).total).toBe(60_500_000);
  });

  test("입력 중 NaN/빈 값은 0으로 취급해 깨지지 않음", () => {
    const items = [row("장비", Number.NaN, Number.NaN)];
    expect(previewTotals(items, [])).toEqual({ supplyPrice: 0, taxPrice: 0, total: 0 });
  });
});

describe("parseQuoteLines — 저장된 jsonb → 폼 행(재발행 프리필)", () => {
  test("정상 줄은 그대로 행으로", () => {
    const lines = [{ name: "UV3300S", unitPrice: 50_000_000, quantity: 1 }];
    expect(parseQuoteLines(lines)).toEqual([row("UV3300S", 50_000_000, 1)]);
  });
  test("배열이 아니면 빈 배열", () => {
    expect(parseQuoteLines(null)).toEqual([]);
    expect(parseQuoteLines({})).toEqual([]);
    expect(parseQuoteLines("x")).toEqual([]);
  });
  test("깨진 값은 안전 기본으로 코어스", () => {
    expect(parseQuoteLines([{ name: 123, unitPrice: "x", quantity: null }])).toEqual([
      row("", 0, 0),
    ]);
  });
});

describe("availableIncludedNames / itemRowsToLines — 카탈로그 장비 선택", () => {
  const catalog: QuoteCatalogItem[] = [
    { id: "jp", name: "JP1113", model: "JP1113", basePrice: 48_000_000, category: "평판커팅기", specs: [],
      options: [{ kind: "included", name: "자동 급지" }, { kind: "included", name: "안전 센서" }, { kind: "extra", name: "연장 보증" }] },
    { id: "uv", name: "UV3300S", model: "UV-3300S", basePrice: 50_000_000, category: "평판커팅기", specs: [],
      options: [{ kind: "included", name: "자동 급지" }, { kind: "included", name: "집진 장치" }] },
  ];
  const item = (equipmentId: string, name: string, unitPrice: number): ItemRow => ({ equipmentId, name, unitPrice, quantity: 1 });

  test("선택 장비들의 포함옵션 풀(중복 제거·순서 보존)", () => {
    expect(availableIncludedNames([item("jp", "JP1113", 48_000_000), item("uv", "UV3300S", 50_000_000)], catalog))
      .toEqual(["자동 급지", "안전 센서", "집진 장치"]);
  });
  test("직접입력(equipmentId 빈값) 장비는 포함옵션 없음", () => {
    expect(availableIncludedNames([item("", "커스텀장비", 1_000_000)], catalog)).toEqual([]);
  });
  test("itemRowsToLines — equipmentId 보존(PDF 장비 정보 조회용)", () => {
    expect(itemRowsToLines([item("jp", "JP1113", 48_000_000)])).toEqual([{ name: "JP1113", unitPrice: 48_000_000, quantity: 1, equipmentId: "jp" }]);
  });
  test("itemRowsToLines — 직접입력(equipmentId 빈값)은 미포함", () => {
    expect(itemRowsToLines([item("", "수기 장비", 1_000_000)])).toEqual([{ name: "수기 장비", unitPrice: 1_000_000, quantity: 1 }]);
  });
  test("parseQuoteLines — 저장된 equipmentId 복원(재발행 프리필)", () => {
    expect(parseQuoteLines([{ name: "JP1113", unitPrice: 48_000_000, quantity: 1, equipmentId: "jp" }])).toEqual([
      { name: "JP1113", unitPrice: 48_000_000, quantity: 1, equipmentId: "jp" },
    ]);
  });
});

describe("buildIncludedRows / buildQuoteOptions — 포함옵션 스냅샷", () => {
  test("포함옵션 이름 → 단가0·수량1·kind=included", () => {
    expect(buildIncludedRows(["자동 급지", "안전 센서"])).toEqual([
      { name: "자동 급지", unitPrice: 0, quantity: 1, kind: "included" },
      { name: "안전 센서", unitPrice: 0, quantity: 1, kind: "included" },
    ]);
  });
  test("included 먼저 + extra(kind=extra) 뒤, 빈 extra 제거", () => {
    const opts = buildQuoteOptions(["자동 급지"], [row("연장 보증", 1_500_000, 1), row("", 0, 1)]);
    expect(opts).toEqual([
      { name: "자동 급지", unitPrice: 0, quantity: 1, kind: "included" },
      { name: "연장 보증", unitPrice: 1_500_000, quantity: 1, kind: "extra" },
    ]);
  });
  test("포함옵션은 단가 0이라 합계에 영향 없음", () => {
    const items = [row("UV3300S", 50_000_000, 1)];
    const options = buildQuoteOptions(["자동 급지", "안전 센서"], []);
    expect(calculateQuote({ items, options }).total).toBe(55_000_000);
  });
});

describe("parseQuoteLines — kind 보존", () => {
  test("kind=included/extra 줄은 kind 유지", () => {
    const lines = [
      { name: "자동 급지", unitPrice: 0, quantity: 1, kind: "included" },
      { name: "연장 보증", unitPrice: 1_500_000, quantity: 1, kind: "extra" },
    ];
    expect(parseQuoteLines(lines)).toEqual([
      { name: "자동 급지", unitPrice: 0, quantity: 1, kind: "included" },
      { name: "연장 보증", unitPrice: 1_500_000, quantity: 1, kind: "extra" },
    ]);
  });
  test("잘못된 kind는 무시(미지정)", () => {
    expect(parseQuoteLines([{ name: "x", unitPrice: 1, quantity: 1, kind: "weird" }])).toEqual([
      row("x", 1, 1),
    ]);
  });
});

describe("validateQuoteForm — 저장 전 검증", () => {
  test("유효하면 null", () => {
    expect(validateQuoteForm([row("UV3300S", 50_000_000, 1)], [])).toBeNull();
  });
  test("장비 0줄이면 에러", () => {
    expect(validateQuoteForm([], [row("옵션", 1000, 1)])).toMatch(/장비/);
  });
  test("이름 빈 줄이면 에러", () => {
    expect(validateQuoteForm([row("  ", 1000, 1)], [])).toMatch(/이름/);
  });
  test("수량 0·소수면 에러", () => {
    expect(validateQuoteForm([row("장비", 1000, 0)], [])).toMatch(/수량/);
    expect(validateQuoteForm([row("장비", 1000, 1.5)], [])).toMatch(/수량/);
  });
  test("단가 소수면 에러", () => {
    expect(validateQuoteForm([row("장비", 1000.5, 1)], [])).toMatch(/단가/);
  });
});

describe("formPreviewTotals", () => {
  const catalog: QuoteCatalogItem[] = [
    {
      id: "eq1",
      name: "UV3300S",
      model: "M1",
      basePrice: 50_000_000,
      category: "프린터",
      specs: [],
      options: [
        { kind: "included", name: "기본설치" },
        { kind: "included", name: "원격지원" },
      ],
    },
  ];

  test("장비 + 추가옵션 합계(공급가·세액10%·합계) 계산", () => {
    const items: ItemRow[] = [{ equipmentId: "eq1", name: "UV3300S", unitPrice: 50_000_000, quantity: 1 }];
    const extra: QuoteRow[] = [{ name: "프린트헤드", unitPrice: 2_500_000, quantity: 2 }];
    // 포함옵션(단가 0)은 합계에 영향 없음 → 공급가 = 50,000,000 + 5,000,000 = 55,000,000
    const r = formPreviewTotals(items, extra, [], catalog);
    expect(r.supplyPrice).toBe(55_000_000);
    expect(r.taxPrice).toBe(5_500_000);
    expect(r.total).toBe(60_500_000);
  });

  test("포함옵션 해제는 합계에 영향 없음(단가 0)", () => {
    const items: ItemRow[] = [{ equipmentId: "eq1", name: "UV3300S", unitPrice: 50_000_000, quantity: 1 }];
    const all = formPreviewTotals(items, [], [], catalog);
    const someDeselected = formPreviewTotals(items, [], ["원격지원"], catalog);
    expect(someDeselected.supplyPrice).toBe(all.supplyPrice);
    expect(someDeselected.total).toBe(all.total);
  });

  test("빈/NaN 입력은 0으로 처리(공급가 0)", () => {
    const items: ItemRow[] = [{ equipmentId: "", name: "", unitPrice: Number.NaN, quantity: Number.NaN }];
    const r = formPreviewTotals(items, [], [], catalog);
    expect(r.supplyPrice).toBe(0);
    expect(r.total).toBe(0);
  });
});

const SPEC_CAT: QuoteCatalogItem[] = [{
  id: "eq1", name: "프린터A", model: null, basePrice: 1000, category: null, options: [],
  specs: [{ group: "성능", icon: "gauge", items: [
    { id: "s1", label: "속도", value: "30", pdf: true },
    { id: "s2", label: "해상도", value: "1200", pdf: true },
  ] }],
}];

describe("mainEquipmentSpecs — 메인 장비 사양", () => {
  test("첫 카탈로그 장비행의 사양을 반환", () => {
    const items: ItemRow[] = [{ equipmentId: "eq1", name: "프린터A", unitPrice: 1000, quantity: 1 }];
    expect(mainEquipmentSpecs(items, SPEC_CAT)[0]!.items.map((i) => i.id)).toEqual(["s1", "s2"]);
  });
  test("카탈로그 장비행 없으면(직접입력만) 빈 배열", () => {
    const items: ItemRow[] = [{ equipmentId: "", name: "직접", unitPrice: 1000, quantity: 1 }];
    expect(mainEquipmentSpecs(items, SPEC_CAT)).toEqual([]);
  });
});

describe("specSelectionBudget — 사양 선택 예산", () => {
  test("max·used·over를 계산", () => {
    const items: ItemRow[] = [{ equipmentId: "eq1", name: "프린터A", unitPrice: 1000, quantity: 1 }];
    const r = specSelectionBudget(items, [], [], SPEC_CAT, ["s1", "s2"]);
    expect(r.max).toBeGreaterThan(0);
    expect(r.used).toBe(2); // 그룹1(제목1) + 항목2(2열 1줄) = 2
    expect(typeof r.over).toBe("boolean");
  });
});

describe("mainEquipmentSpecs — 항목 이름·값 둘 다 있어야 포함", () => {
  const CAT_EMPTY: QuoteCatalogItem[] = [{
    id: "eqE", name: "장비E", model: null, basePrice: 1000, category: null, options: [],
    specs: [{ group: "성능", icon: "gauge", items: [
      { id: "v1", label: "속도", value: "30", pdf: true },       // 라벨+값 → 포함
      { id: "v2", label: "", value: "1,600mm", pdf: true },     // 라벨 없음 → 제외
      { id: "v3", label: "  ", value: "이더넷", pdf: true },     // 공백 라벨 → 제외
      { id: "v4", label: "무게", value: "", pdf: false },        // 값 없음 → 제외
    ] }],
  }];
  test("라벨 없거나 값 없는 항목은 제외(둘 다 있는 것만)", () => {
    const items: ItemRow[] = [{ equipmentId: "eqE", name: "장비E", unitPrice: 1000, quantity: 1 }];
    expect(mainEquipmentSpecs(items, CAT_EMPTY)[0]!.items.map((i) => i.id)).toEqual(["v1"]);
  });
  test("포함 항목이 하나도 없으면 그룹 자체 제거", () => {
    const cat: QuoteCatalogItem[] = [{
      id: "eqZ", name: "Z", model: null, basePrice: 0, category: null, options: [],
      specs: [{ group: "G", icon: "settings", items: [
        { id: "z1", label: "x", value: "", pdf: true },   // 값 없음
        { id: "z2", label: "", value: "1,600mm", pdf: true }, // 라벨 없음
      ] }],
    }];
    const items: ItemRow[] = [{ equipmentId: "eqZ", name: "Z", unitPrice: 0, quantity: 1 }];
    expect(mainEquipmentSpecs(items, cat)).toEqual([]);
  });
});
