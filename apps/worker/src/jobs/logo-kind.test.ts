import { describe, expect, test } from "vitest";
import { resolveLogoKind, type CategoryLite } from "./logo-kind";

// 트리: 프린터(대분류, printer) > 롤UV(소분류) / 커팅기(대분류, cutter) > 평판(소분류) / 기타(대분류, 미설정)
const CATS: CategoryLite[] = [
  { id: "printer", parent_id: null, quote_logo_kind: "printer" },
  { id: "roll-uv", parent_id: "printer", quote_logo_kind: null },
  { id: "cutter", parent_id: null, quote_logo_kind: "cutter" },
  { id: "flatbed", parent_id: "cutter", quote_logo_kind: null },
  { id: "etc", parent_id: null, quote_logo_kind: null },
];

describe("resolveLogoKind", () => {
  test("소분류 → 부모 대분류의 로고 종류", () => {
    expect(resolveLogoKind("roll-uv", CATS)).toBe("printer");
    expect(resolveLogoKind("flatbed", CATS)).toBe("cutter");
  });
  test("대분류 직접 지정 시 자기 값", () => {
    expect(resolveLogoKind("printer", CATS)).toBe("printer");
    expect(resolveLogoKind("cutter", CATS)).toBe("cutter");
  });
  test("미설정 대분류·그 소분류 → null", () => {
    expect(resolveLogoKind("etc", CATS)).toBeNull();
  });
  test("categoryId 없음/미존재 → null", () => {
    expect(resolveLogoKind(null, CATS)).toBeNull();
    expect(resolveLogoKind(undefined, CATS)).toBeNull();
    expect(resolveLogoKind("ghost", CATS)).toBeNull();
  });
});
