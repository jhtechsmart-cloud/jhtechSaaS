import { describe, expect, test } from "vitest";
import { calculateQuote, QuoteInputSchema } from "./quote-calc";

describe("calculateQuote — 견적 금액 산출", () => {
  test("옵션 없는 장비 1대: 공급가=단가, 세액=10% 반올림, 합계", () => {
    const r = calculateQuote({
      items: [{ name: "UV3300S", unitPrice: 50_000_000, quantity: 1 }],
      options: [],
    });
    expect(r.supplyPrice).toBe(50_000_000);
    expect(r.taxPrice).toBe(5_000_000);
    expect(r.total).toBe(55_000_000);
  });

  test("추가옵션 단가×수량 합산: 프린트헤드 2,500,000 × 2", () => {
    const r = calculateQuote({
      items: [{ name: "UV3300S", unitPrice: 50_000_000, quantity: 1 }],
      options: [{ name: "Ricoh Gen5i 프린트헤드", unitPrice: 2_500_000, quantity: 2 }],
    });
    expect(r.supplyPrice).toBe(55_000_000); // 50,000,000 + 5,000,000
    expect(r.taxPrice).toBe(5_500_000);
    expect(r.total).toBe(60_500_000);
  });

  test("음수 옵션(할인/제외)은 공급가에서 차감", () => {
    const r = calculateQuote({
      items: [{ name: "UV3300S", unitPrice: 50_000_000, quantity: 1 }],
      options: [{ name: "잉크 패키지 제외", unitPrice: -1_000_000, quantity: 1 }],
    });
    expect(r.supplyPrice).toBe(49_000_000);
    expect(r.taxPrice).toBe(4_900_000);
    expect(r.total).toBe(53_900_000);
  });

  test("장비 여러 대(배열) 합산", () => {
    const r = calculateQuote({
      items: [
        { name: "UV3300S", unitPrice: 50_000_000, quantity: 1 },
        { name: "UV5000", unitPrice: 30_000_000, quantity: 2 },
      ],
      options: [],
    });
    expect(r.supplyPrice).toBe(110_000_000); // 50,000,000 + 60,000,000
    expect(r.taxPrice).toBe(11_000_000);
    expect(r.total).toBe(121_000_000);
  });

  test("세액 원단위 반올림(.5 올림) + 큰 금액 부동소수점 안전", () => {
    // 12,345,675 × 0.1 = 1,234,567.5 → 반올림 1,234,568
    const r = calculateQuote({
      items: [{ name: "장비", unitPrice: 12_345_675, quantity: 1 }],
      options: [],
    });
    expect(r.taxPrice).toBe(1_234_568);

    // 큰 금액도 정수 원으로 정확히
    const big = calculateQuote({
      items: [{ name: "장비", unitPrice: 999_999_999, quantity: 1 }],
      options: [],
    });
    expect(big.taxPrice).toBe(100_000_000); // 99,999,999.9 → 100,000,000
  });

  test("빈 견적(장비0·옵션0) → 0/0/0", () => {
    const r = calculateQuote({ items: [], options: [] });
    expect(r).toEqual({ supplyPrice: 0, taxPrice: 0, total: 0 });
  });

  test("taxRate 미지정 시 기본 0.1, 명시 시 그 값", () => {
    const base = { items: [{ name: "장비", unitPrice: 10_000_000, quantity: 1 }], options: [] };
    expect(calculateQuote(base).taxPrice).toBe(1_000_000); // 기본 10%
    expect(calculateQuote({ ...base, taxRate: 0 }).taxPrice).toBe(0); // 영세율
    expect(calculateQuote({ ...base, taxRate: 0 }).total).toBe(10_000_000);
  });
});

describe("QuoteInputSchema — 견적 입력 경계 검증", () => {
  const validLine = { name: "UV3300S", unitPrice: 50_000_000, quantity: 1 };

  test("유효한 입력은 통과", () => {
    const r = QuoteInputSchema.safeParse({
      items: [validLine],
      options: [{ name: "할인", unitPrice: -1_000_000, quantity: 1 }], // 음수 단가 허용
      taxRate: 0.1,
    });
    expect(r.success).toBe(true);
  });

  test("taxRate 미지정 허용(엔진이 기본 0.1 적용)", () => {
    const r = QuoteInputSchema.safeParse({ items: [validLine], options: [] });
    expect(r.success).toBe(true);
  });

  test("equipmentId를 보존한다(strip 안 함) — PDF 장비 정보 조회용", () => {
    const r = QuoteInputSchema.safeParse({
      items: [{ ...validLine, equipmentId: "eq-uuid-1" }],
      options: [],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.items[0].equipmentId).toBe("eq-uuid-1");
  });

  test("equipmentId는 금액 계산에 영향 없다", () => {
    const withId = calculateQuote({ items: [{ ...validLine, equipmentId: "eq-1" }], options: [] });
    const without = calculateQuote({ items: [validLine], options: [] });
    expect(withId).toEqual(without);
  });

  test("quantity 0·음수·소수 거부", () => {
    for (const quantity of [0, -1, 1.5]) {
      const r = QuoteInputSchema.safeParse({ items: [{ ...validLine, quantity }], options: [] });
      expect(r.success).toBe(false);
    }
  });

  test("unitPrice 소수·NaN·무한대 거부(정수 원만)", () => {
    for (const unitPrice of [1000.5, NaN, Infinity]) {
      const r = QuoteInputSchema.safeParse({ items: [{ ...validLine, unitPrice }], options: [] });
      expect(r.success).toBe(false);
    }
  });

  test("name 빈 문자열·공백만 거부", () => {
    for (const name of ["", "   "]) {
      const r = QuoteInputSchema.safeParse({ items: [{ ...validLine, name }], options: [] });
      expect(r.success).toBe(false);
    }
  });

  test("taxRate 범위 밖(음수·1 초과) 거부", () => {
    for (const taxRate of [-0.1, 1.5]) {
      const r = QuoteInputSchema.safeParse({ items: [validLine], options: [], taxRate });
      expect(r.success).toBe(false);
    }
  });
});
