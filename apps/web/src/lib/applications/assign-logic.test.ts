import { describe, expect, test } from "vitest";
import { nextStatusOnAssign } from "./assign-logic";

describe("nextStatusOnAssign — 배정/해제 시 status auto-bump", () => {
  test("new + 배정 → assigned", () => {
    expect(nextStatusOnAssign("new", "u1")).toBe("assigned");
  });
  test("assigned + 해제 → new (재트리아지 풀)", () => {
    expect(nextStatusOnAssign("assigned", null)).toBe("new");
  });
  test("quoted + 해제 → 변경 없음(null)", () => {
    expect(nextStatusOnAssign("quoted", null)).toBeNull();
  });
  test("closed + 재배정 → 변경 없음(null)", () => {
    expect(nextStatusOnAssign("closed", "u2")).toBeNull();
  });
  test("new + 해제 → 변경 없음(null)", () => {
    expect(nextStatusOnAssign("new", null)).toBeNull();
  });
  test("assigned + 재배정 → 변경 없음(null, 담당만 교체)", () => {
    expect(nextStatusOnAssign("assigned", "u3")).toBeNull();
  });
});
