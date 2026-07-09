import { describe, expect, test } from "vitest";
import { inventoryInputSchema } from "./schema";

const base = { stockQty: 1, demoQty: 0, usedQty: 0, restockDate: null, note: null };
const ok = (o: object) => inventoryInputSchema.safeParse({ ...base, ...o }).success;

describe("inventoryInputSchema", () => {
  test("정상 입력 통과", () => {
    expect(ok({ stockQty: 5, note: "입고됨" })).toBe(true);
    expect(ok({ stockQty: 0, restockDate: "2026-07-01", demoQty: 2, usedQty: 1 })).toBe(true);
  });
  test("수량 음수·소수 거부", () => {
    expect(ok({ stockQty: -1 })).toBe(false);
    expect(ok({ stockQty: 1.5 })).toBe(false);
  });
  test("데모·중고 수량 음수·소수 거부", () => {
    expect(ok({ demoQty: -1 })).toBe(false);
    expect(ok({ usedQty: 2.5 })).toBe(false);
  });
  test("날짜 형식 오류 거부(null은 허용)", () => {
    expect(ok({ restockDate: "2026/07/01" })).toBe(false);
    expect(ok({ restockDate: null })).toBe(true);
  });
  test("메모 500자 초과 거부", () => {
    expect(ok({ note: "a".repeat(501) })).toBe(false);
    expect(ok({ note: "a".repeat(500) })).toBe(true);
  });
});
