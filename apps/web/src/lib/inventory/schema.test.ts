import { describe, expect, test } from "vitest";
import { inventoryInputSchema } from "./schema";

const ok = (o: object) => inventoryInputSchema.safeParse(o).success;

describe("inventoryInputSchema", () => {
  test("정상 입력 통과", () => {
    expect(ok({ stockQty: 5, restockDate: null, note: "입고됨" })).toBe(true);
    expect(ok({ stockQty: 0, restockDate: "2026-07-01", note: null })).toBe(true);
  });
  test("수량 음수·소수 거부", () => {
    expect(ok({ stockQty: -1, restockDate: null, note: null })).toBe(false);
    expect(ok({ stockQty: 1.5, restockDate: null, note: null })).toBe(false);
  });
  test("날짜 형식 오류 거부(null은 허용)", () => {
    expect(ok({ stockQty: 1, restockDate: "2026/07/01", note: null })).toBe(false);
    expect(ok({ stockQty: 1, restockDate: null, note: null })).toBe(true);
  });
  test("메모 500자 초과 거부", () => {
    expect(ok({ stockQty: 1, restockDate: null, note: "a".repeat(501) })).toBe(false);
    expect(ok({ stockQty: 1, restockDate: null, note: "a".repeat(500) })).toBe(true);
  });
});
