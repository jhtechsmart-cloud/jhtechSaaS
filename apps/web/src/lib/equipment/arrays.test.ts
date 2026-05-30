import { describe, it, expect } from "vitest";
import { moveItem } from "./arrays";

describe("moveItem", () => {
  it("앞으로 이동", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });
  it("뒤로 이동", () => {
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });
  it("같은 위치·범위 밖은 원본 그대로", () => {
    const a = ["a", "b"];
    expect(moveItem(a, 1, 1)).toEqual(["a", "b"]);
    expect(moveItem(a, -1, 0)).toEqual(["a", "b"]);
    expect(moveItem(a, 0, 5)).toEqual(["a", "b"]);
  });
  it("원본 불변(새 배열 반환)", () => {
    const a = ["a", "b"];
    moveItem(a, 0, 1);
    expect(a).toEqual(["a", "b"]);
  });
});
