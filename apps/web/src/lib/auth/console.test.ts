import { describe, expect, test } from "vitest";
import { hasAnyConsoleCapability, landingPathFor } from "./console";
import { SALES_PRESET, ADMIN_PRESET } from "@jhtechsaas/shared";

describe("hasAnyConsoleCapability — 콘솔 진입 자격", () => {
  test("SALES_PRESET → true", () => {
    expect(hasAnyConsoleCapability([...SALES_PRESET])).toBe(true);
  });
  test("ADMIN_PRESET(users.manage super) → true", () => {
    expect(hasAnyConsoleCapability([...ADMIN_PRESET])).toBe(true);
  });
  test("빈 권한 → false", () => {
    expect(hasAnyConsoleCapability([])).toBe(false);
  });
  test("콘솔 무관 키만 → false", () => {
    expect(hasAnyConsoleCapability(["nonsense.key"])).toBe(false);
  });
});

describe("landingPathFor — 로그인 후 첫 화면", () => {
  test("영업(applications.*) → /admin/applications", () => {
    expect(landingPathFor([...SALES_PRESET])).toBe("/admin/applications");
  });
  test("관리자(super) → /admin/applications (운영 허브)", () => {
    expect(landingPathFor([...ADMIN_PRESET])).toBe("/admin/applications");
  });
  test("고객 권한만 → /admin/customers", () => {
    expect(landingPathFor(["customers.edit"])).toBe("/admin/customers");
  });
  test("장비 권한만 → /admin/equipment", () => {
    expect(landingPathFor(["equipment.manage"])).toBe("/admin/equipment");
  });
});
