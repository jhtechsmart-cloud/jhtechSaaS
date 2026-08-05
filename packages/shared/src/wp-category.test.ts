import { describe, expect, it } from "vitest";
import { resolveWpCategoryId, type WpCategoryNode } from "./wp-category";

// 분류 트리: 대분류(프린터) > 소분류(UV평판) 구조로 조상 해석을 검증한다.
const nodes: WpCategoryNode[] = [
  { id: "root-printer", parent_id: null, wp_category_id: 8 },
  { id: "sub-uv-flat", parent_id: "root-printer", wp_category_id: 11 },
  { id: "sub-uv-roll", parent_id: "root-printer", wp_category_id: null },
  { id: "root-cutter", parent_id: null, wp_category_id: null },
  { id: "sub-cutter-digital", parent_id: "root-cutter", wp_category_id: null },
];

describe("resolveWpCategoryId", () => {
  it("소분류에 직접 설정된 값을 최우선으로 쓴다", () => {
    expect(resolveWpCategoryId("sub-uv-flat", nodes)).toBe(11);
  });

  it("소분류 미설정이면 조상(대분류) 값으로 폴백한다", () => {
    expect(resolveWpCategoryId("sub-uv-roll", nodes)).toBe(8);
  });

  it("조상까지 전부 미설정이면 null (매핑 필요)", () => {
    expect(resolveWpCategoryId("sub-cutter-digital", nodes)).toBeNull();
  });

  it("분류 미지정 장비(category_id null)는 null", () => {
    expect(resolveWpCategoryId(null, nodes)).toBeNull();
  });

  it("트리에 없는 id는 null", () => {
    expect(resolveWpCategoryId("ghost", nodes)).toBeNull();
  });

  it("부모 참조 순환이 있어도 무한루프 없이 null로 종료한다", () => {
    const cyclic: WpCategoryNode[] = [
      { id: "a", parent_id: "b", wp_category_id: null },
      { id: "b", parent_id: "a", wp_category_id: null },
    ];
    expect(resolveWpCategoryId("a", cyclic)).toBeNull();
  });
});
