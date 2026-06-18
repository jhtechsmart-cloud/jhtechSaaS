import { describe, it, expect } from "vitest";
import { specBudget, countSpecLines } from "./spec-budget";

describe("specBudget — 한 페이지 예산", () => {
  it("품목·옵션이 적으면 사양 여유가 크다", () => {
    const small = specBudget({ itemCount: 1, includedCount: 0, extraCount: 0 });
    const big = specBudget({ itemCount: 6, includedCount: 8, extraCount: 6 });
    expect(small).toBeGreaterThan(big);
  });
  it("음수로 내려가지 않는다(0 하한)", () => {
    expect(specBudget({ itemCount: 50, includedCount: 50, extraCount: 50 })).toBe(0);
  });
  it("기본 견적(품목1·옵션 약간)은 양수 예산", () => {
    expect(specBudget({ itemCount: 1, includedCount: 3, extraCount: 1 })).toBeGreaterThan(0);
  });
});

describe("countSpecLines — 선택 그룹 줄 수", () => {
  it("그룹 1개 + 항목 4개(2열) = 제목1 + 항목2줄 = 3", () => {
    const g = [{ group: "성능", icon: "gauge" as const, items: [
      { id: "a", label: "1", value: "1" }, { id: "b", label: "2", value: "2" },
      { id: "c", label: "3", value: "3" }, { id: "d", label: "4", value: "4" },
    ] }];
    expect(countSpecLines(g)).toBe(3);
  });
  it("빈 선택 = 0줄", () => {
    expect(countSpecLines([])).toBe(0);
  });
});
