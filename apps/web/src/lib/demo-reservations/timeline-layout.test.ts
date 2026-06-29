import { describe, expect, test } from "vitest";
import { layoutDayReservations } from "./timeline-layout";

describe("layoutDayReservations", () => {
  test("겹치지 않는 연속 예약은 각자 전체 폭(cols=1)", () => {
    const m = layoutDayReservations([
      { id: "a", start: "10:00", end: "11:00" },
      { id: "b", start: "11:00", end: "12:00" }, // 경계 접촉=겹침 아님
    ]);
    expect(m.get("a")).toEqual({ col: 0, cols: 1 });
    expect(m.get("b")).toEqual({ col: 0, cols: 1 });
  });

  test("같은 시간대 2건은 2열로 나란히", () => {
    const m = layoutDayReservations([
      { id: "x", start: "11:00", end: "12:30" },
      { id: "y", start: "11:00", end: "12:00" },
    ]);
    // 정렬상 종료 빠른 y가 col0, x가 col1.
    expect(m.get("y")).toEqual({ col: 0, cols: 2 });
    expect(m.get("x")).toEqual({ col: 1, cols: 2 });
  });

  test("3건 동시 겹침은 3열", () => {
    const m = layoutDayReservations([
      { id: "a", start: "11:00", end: "12:00" },
      { id: "b", start: "11:00", end: "12:00" },
      { id: "c", start: "11:00", end: "12:00" },
    ]);
    expect(m.get("a")?.cols).toBe(3);
    expect(m.get("b")?.cols).toBe(3);
    expect(m.get("c")?.cols).toBe(3);
    expect(new Set([m.get("a")!.col, m.get("b")!.col, m.get("c")!.col])).toEqual(
      new Set([0, 1, 2]),
    );
  });

  test("부분 겹침 체인 — A·C는 레인 공유, B는 별도 열(클러스터 2열)", () => {
    const m = layoutDayReservations([
      { id: "a", start: "10:00", end: "11:00" },
      { id: "b", start: "10:30", end: "11:30" },
      { id: "c", start: "11:00", end: "12:00" }, // A와 경계 접촉(겹침 아님)이라 A 레인 재사용
    ]);
    expect(m.get("a")).toEqual({ col: 0, cols: 2 });
    expect(m.get("b")).toEqual({ col: 1, cols: 2 });
    expect(m.get("c")).toEqual({ col: 0, cols: 2 });
  });

  test("두 클러스터는 독립적으로 폭 계산", () => {
    const m = layoutDayReservations([
      { id: "a", start: "10:00", end: "11:00" },
      { id: "b", start: "10:00", end: "11:00" }, // 클러스터1: 2열
      { id: "c", start: "14:00", end: "15:00" }, // 클러스터2: 1열
    ]);
    expect(m.get("a")?.cols).toBe(2);
    expect(m.get("b")?.cols).toBe(2);
    expect(m.get("c")).toEqual({ col: 0, cols: 1 });
  });

  test("빈 입력", () => {
    expect(layoutDayReservations([]).size).toBe(0);
  });
});
