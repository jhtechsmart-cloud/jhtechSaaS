import { describe, expect, it } from "vitest";
import { resolveHostRedirect } from "./host-routing";

// 서브도메인 진입 분기 규칙(순수 함수) 단위 테스트.
// admin 서브도메인의 루트(/)만 /admin으로 보내고, 나머지는 통과(null).
describe("resolveHostRedirect", () => {
  it("admin 호스트 루트 진입 → /admin", () => {
    expect(resolveHostRedirect("admin.jhtech.co.kr", "/")).toBe("/admin");
  });

  it("admin 호스트에 포트가 붙어도 → /admin", () => {
    expect(resolveHostRedirect("admin.jhtech.co.kr:443", "/")).toBe("/admin");
  });

  it("admin 호스트 대소문자 섞여도 → /admin", () => {
    expect(resolveHostRedirect("Admin.JHTech.co.kr", "/")).toBe("/admin");
  });

  it("admin 호스트라도 루트가 아니면 통과(null)", () => {
    expect(resolveHostRedirect("admin.jhtech.co.kr", "/equipment")).toBeNull();
  });

  it("sales 호스트(공개 포털)는 루트여도 통과(null)", () => {
    expect(resolveHostRedirect("sales.jhtech.co.kr", "/")).toBeNull();
  });

  it("로컬 개발 호스트는 통과(null)", () => {
    expect(resolveHostRedirect("localhost:3000", "/")).toBeNull();
  });

  it("Vercel 기본 도메인은 통과(null)", () => {
    expect(resolveHostRedirect("jhtech-saa-s-web.vercel.app", "/")).toBeNull();
  });

  it("호스트 헤더 없으면 통과(null)", () => {
    expect(resolveHostRedirect(null, "/")).toBeNull();
  });
});
