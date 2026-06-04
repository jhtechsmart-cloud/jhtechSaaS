import { describe, expect, test } from "vitest";
import { toBarSegments, isDashboardEmpty } from "./bars";

describe("toBarSegments — count record → 색바 세그먼트", () => {
  const meta = {
    new: { label: "접수", color: "#2563EB" },
    closed: { label: "완료", color: "#16A34A" },
  };
  const order = ["new", "closed"] as const;

  test("정상 분포: 세그먼트에 label·color·count·pct", () => {
    const segs = toBarSegments({ new: 3, closed: 1 }, meta, order);
    expect(segs).toEqual([
      { key: "new", label: "접수", color: "#2563EB", count: 3, pct: 75 },
      { key: "closed", label: "완료", color: "#16A34A", count: 1, pct: 25 },
    ]);
  });

  test("전부 0: pct 0, count 0 (자리 유지용 세그먼트 보존)", () => {
    const segs = toBarSegments({ new: 0, closed: 0 }, meta, order);
    expect(segs.map((s) => s.count)).toEqual([0, 0]);
    expect(segs.map((s) => s.pct)).toEqual([0, 0]);
  });
});

describe("isDashboardEmpty — 전체 0 판정", () => {
  test("모든 도메인 0건이면 true", () => {
    expect(isDashboardEmpty({ applications: 0, service: 0, supply: 0 })).toBe(true);
  });
  test("한 도메인이라도 있으면 false", () => {
    expect(isDashboardEmpty({ applications: 2, service: 0, supply: 0 })).toBe(false);
  });
});
