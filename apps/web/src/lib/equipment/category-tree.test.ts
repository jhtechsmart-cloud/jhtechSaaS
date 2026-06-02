import { describe, expect, test } from "vitest";
import { buildTree, equipmentSelectableOptions, scopeSelectableOptions, type CategoryNode } from "./category-tree";

const NODES: CategoryNode[] = [
  { id: "p1", parent_id: null, name: "프린터", sort_order: 0 },
  { id: "u1", parent_id: "p1", name: "UV프린터", sort_order: 0 },
  { id: "s1", parent_id: "p1", name: "솔벤트프린터", sort_order: 1 },
  { id: "c1", parent_id: null, name: "커팅기", sort_order: 1 },
];

describe("buildTree", () => {
  test("대분류별 children 묶음", () => {
    const tree = buildTree(NODES);
    expect(tree.map((t) => t.name)).toEqual(["프린터", "커팅기"]);
    expect(tree[0].children.map((c) => c.name)).toEqual(["UV프린터", "솔벤트프린터"]);
    expect(tree[1].children).toEqual([]);
  });
});

describe("equipmentSelectableOptions — 장비 부착(자식있는 대분류 비선택)", () => {
  test("소분류 + 자식없는 대분류만 selectable, 자식있는 대분류는 그룹헤더", () => {
    const opts = equipmentSelectableOptions(NODES);
    expect(opts).toEqual([
      { group: "프린터", options: [{ id: "u1", name: "UV프린터" }, { id: "s1", name: "솔벤트프린터" }] },
      { group: null, options: [{ id: "c1", name: "커팅기" }] },
    ]);
  });
});

describe("scopeSelectableOptions — 소모품 범위(대분류=공통도 선택)", () => {
  test("대분류(공통)·소분류 모두 selectable", () => {
    const opts = scopeSelectableOptions(NODES);
    expect(opts).toEqual([
      { group: "프린터", options: [{ id: "p1", name: "프린터 공통" }, { id: "u1", name: "UV프린터" }, { id: "s1", name: "솔벤트프린터" }] },
      { group: null, options: [{ id: "c1", name: "커팅기 공통" }] },
    ]);
  });
});
