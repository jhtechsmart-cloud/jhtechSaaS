import { describe, expect, test } from "vitest";
import { groupByCategory } from "./group";

const it = (name: string, category: string | null) => ({ name, category });

describe("groupByCategory", () => {
  test("분류명별로 묶고, 그룹 내 입력 순서 보존", () => {
    const g = groupByCategory([
      it("A", "프린터"),
      it("B", "커팅기"),
      it("C", "프린터"),
    ]);
    expect(g.map((x) => x.category)).toEqual(["커팅기", "프린터"]); // ko 정렬
    expect(g.find((x) => x.category === "프린터")!.items.map((i) => i.name)).toEqual(["A", "C"]);
  });

  test("미분류(null·빈문자)는 맨 뒤", () => {
    const g = groupByCategory([it("A", null), it("B", "프린터"), it("C", "  ")]);
    expect(g.map((x) => x.category)).toEqual(["프린터", "미분류"]);
    expect(g.find((x) => x.category === "미분류")!.items.map((i) => i.name)).toEqual(["A", "C"]);
  });

  test("공백 트리밍 후 같은 분류로 병합", () => {
    const g = groupByCategory([it("A", "프린터"), it("B", " 프린터 ")]);
    expect(g).toHaveLength(1);
    expect(g[0].items).toHaveLength(2);
  });

  test("빈 배열", () => {
    expect(groupByCategory([])).toEqual([]);
  });
});
