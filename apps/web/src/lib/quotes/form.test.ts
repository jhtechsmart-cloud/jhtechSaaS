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
    { id: "jp", name: "JP1113", model: "JP1113", basePrice: 48_000_000, category: "평판커팅기",
      options: [{ kind: "included", name: "자동 급지" }, { kind: "included", name: "안전 센서" }, { kind: "extra", name: "연장 보증" }] },
    { id: "uv", name: "UV3300S", model: "UV-3300S", basePrice: 50_000_000, category: "평판커팅기",
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
