import { describe, it, expect } from "vitest";
import { isApplicationDetailPath } from "./is-detail-path";

describe("isApplicationDetailPath", () => {
  it("목록 루트는 상세 아님", () => {
    expect(isApplicationDetailPath("/admin/applications")).toBe(false);
    expect(isApplicationDetailPath("/admin/applications/")).toBe(false);
  });
  it("의뢰 id가 붙으면 상세", () => {
    expect(isApplicationDetailPath("/admin/applications/abc-123")).toBe(true);
  });
  it("상세 하위 경로(출고의뢰서 등)도 상세", () => {
    expect(isApplicationDetailPath("/admin/applications/abc-123/release-order")).toBe(true);
  });
  it("다른 화면은 상세 아님", () => {
    expect(isApplicationDetailPath("/admin/dashboard")).toBe(false);
    expect(isApplicationDetailPath("/admin/quotes/new")).toBe(false);
  });
});
