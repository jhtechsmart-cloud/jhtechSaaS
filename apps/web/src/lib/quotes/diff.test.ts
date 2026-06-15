import { describe, expect, test } from "vitest";
import { diffQuoteVersions } from "./diff";

const line = (name: string, unitPrice: number, quantity = 1, kind?: "included" | "extra") => ({
  name,
  unitPrice,
  quantity,
  ...(kind ? { kind } : {}),
});

describe("diffQuoteVersions — 직전 버전 대비 차이", () => {
  test("변경 없으면 changes 비고 delta 0", () => {
    const v = { items: [line("UV3300S", 50_000_000)], options: [] };
    const d = diffQuoteVersions(v, v);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.changed).toEqual([]);
    expect(d.totalDelta).toBe(0);
  });

  test("추가된 품목/옵션 = added", () => {
    const prev = { items: [line("UV3300S", 50_000_000)], options: [] };
    const curr = {
      items: [line("UV3300S", 50_000_000)],
      options: [line("연장 보증", 1_500_000, 1, "extra")],
    };
    const d = diffQuoteVersions(prev, curr);
    expect(d.added.map((c) => c.name)).toEqual(["연장 보증"]);
    expect(d.removed).toEqual([]);
    expect(d.totalDelta).toBe(1_500_000);
  });

  test("삭제된 줄 = removed", () => {
    const prev = {
      items: [line("UV3300S", 50_000_000)],
      options: [line("연장 보증", 1_500_000, 1, "extra")],
    };
    const curr = { items: [line("UV3300S", 50_000_000)], options: [] };
    const d = diffQuoteVersions(prev, curr);
    expect(d.removed.map((c) => c.name)).toEqual(["연장 보증"]);
    expect(d.totalDelta).toBe(-1_500_000);
  });

  test("단가·수량 변경 = changed(before/after)", () => {
    const prev = { items: [line("UV3300S", 50_000_000, 1)], options: [] };
    const curr = { items: [line("UV3300S", 48_000_000, 2)], options: [] };
    const d = diffQuoteVersions(prev, curr);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0]).toMatchObject({
      name: "UV3300S",
      before: { unitPrice: 50_000_000, quantity: 1 },
      after: { unitPrice: 48_000_000, quantity: 2 },
    });
    // 50,000,000 → 96,000,000
    expect(d.totalDelta).toBe(46_000_000);
  });

  test("같은 이름이라도 kind가 다르면 별개 줄로 취급", () => {
    const prev = { items: [], options: [line("헤드", 0, 1, "included")] };
    const curr = { items: [], options: [line("헤드", 1_000_000, 1, "extra")] };
    const d = diffQuoteVersions(prev, curr);
    // included '헤드' 삭제 + extra '헤드' 추가 (변경 아님)
    expect(d.removed.map((c) => c.name)).toEqual(["헤드"]);
    expect(d.added.map((c) => c.name)).toEqual(["헤드"]);
    expect(d.changed).toEqual([]);
  });

  test("jsonb unknown(깨진 값) 방어 — 빈 배열 취급", () => {
    const d = diffQuoteVersions({ items: null, options: "x" }, { items: [line("A", 100)], options: undefined });
    expect(d.added.map((c) => c.name)).toEqual(["A"]);
    expect(d.totalBefore).toBe(0);
    expect(d.totalAfter).toBe(100);
  });
});
