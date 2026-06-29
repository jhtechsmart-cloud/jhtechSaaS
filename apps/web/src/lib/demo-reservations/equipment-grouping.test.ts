import { describe, expect, test } from "vitest";
import type { CategoryNode } from "@/lib/equipment/category-tree";
import type { EquipmentOptionRow } from "./queries";
import { groupDemoEquipment } from "./equipment-grouping";

// 분류 트리: 프린터(대) > UV프린터(소), 커팅기(대) > 비닐커팅(소), 분류없는 대분류(기타).
const categories: CategoryNode[] = [
  { id: "cat-printer", parent_id: null, name: "프린터", sort_order: 1, quote_logo_kind: "printer" },
  { id: "cat-uv", parent_id: "cat-printer", name: "UV프린터", sort_order: 1, quote_logo_kind: null },
  { id: "cat-cutter", parent_id: null, name: "커팅기", sort_order: 2, quote_logo_kind: "cutter" },
  { id: "cat-vinyl", parent_id: "cat-cutter", name: "비닐커팅", sort_order: 1, quote_logo_kind: null },
  { id: "cat-etc", parent_id: null, name: "기타장비", sort_order: 3, quote_logo_kind: null },
];

function eq(id: string, name: string, category_id: string | null): EquipmentOptionRow {
  return { id, name, model: null, category_id };
}

describe("groupDemoEquipment", () => {
  test("대분류 직속 장비는 대분류 quote_logo_kind로 분류", () => {
    const result = groupDemoEquipment(
      [eq("e1", "프린터A", "cat-printer"), eq("e2", "커터A", "cat-cutter")],
      categories,
    );
    expect(result.printer.map((x) => x.id)).toEqual(["e1"]);
    expect(result.cutter.map((x) => x.id)).toEqual(["e2"]);
    expect(result.etc).toEqual([]);
  });

  test("소분류 장비는 부모 대분류 quote_logo_kind로 분류", () => {
    const result = groupDemoEquipment(
      [eq("e1", "UV프린터A", "cat-uv"), eq("e2", "비닐커팅A", "cat-vinyl")],
      categories,
    );
    expect(result.printer.map((x) => x.id)).toEqual(["e1"]);
    expect(result.cutter.map((x) => x.id)).toEqual(["e2"]);
  });

  test("quote_logo_kind 미설정 대분류·분류없음 장비는 etc", () => {
    const result = groupDemoEquipment(
      [eq("e1", "기타A", "cat-etc"), eq("e2", "분류없음", null), eq("e3", "유령분류", "cat-missing")],
      categories,
    );
    expect(result.etc.map((x) => x.id)).toEqual(["e1", "e2", "e3"]);
    expect(result.printer).toEqual([]);
    expect(result.cutter).toEqual([]);
  });

  test("그룹 내 순서는 입력 순서를 보존", () => {
    const result = groupDemoEquipment(
      [eq("e2", "프린터B", "cat-printer"), eq("e1", "프린터A", "cat-printer")],
      categories,
    );
    expect(result.printer.map((x) => x.id)).toEqual(["e2", "e1"]);
  });

  test("빈 입력은 빈 그룹", () => {
    const result = groupDemoEquipment([], categories);
    expect(result).toEqual({ printer: [], cutter: [], etc: [] });
  });
});
