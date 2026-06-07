// 견적 작성 폼 순수 로직 — non-server, 서버 모킹 불필요. 합계는 슬라이스1 calculateQuote와 일치해야 한다.
import { describe, expect, test } from "vitest";
import { calculateQuote } from "@jhtechsaas/shared";
import { cleanRows, previewTotals, rowsToQuoteInput, validateQuoteForm, type QuoteRow } from "./form";

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
