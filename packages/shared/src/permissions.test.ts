import { describe, expect, test } from "vitest";
import { PERMISSIONS, can } from "./permissions";

describe("permission registry", () => {
  // v1 capability registry — 새 기능마다 키 1개 추가, 스키마 변경 0.
  test("registry는 10개 capability 키를 정의한다", () => {
    expect([...PERMISSIONS].sort()).toEqual(
      [
        "applications.assign",
        "applications.view_all",
        "consumables.manage",
        "customers.manage",
        "email.send",
        "equipment.manage",
        "quotes.write",
        "service_requests.manage",
        "service_requests.view_all",
        "users.manage",
      ].sort()
    );
  });
});

describe("can() — SQL has_permission 미러 (UI 게이팅용)", () => {
  test("보유한 키면 true", () => {
    expect(can(["quotes.write"], "quotes.write")).toBe(true);
  });

  test("미보유 키면 false", () => {
    expect(can(["quotes.write"], "equipment.manage")).toBe(false);
  });

  test("users.manage 보유자는 모든 키에 true (관리자 = 전체 우회)", () => {
    expect(can(["users.manage"], "equipment.manage")).toBe(true);
    expect(can(["users.manage"], "applications.view_all")).toBe(true);
  });

  test("빈 권한 배열은 false", () => {
    expect(can([], "quotes.write")).toBe(false);
  });
});

describe("customers.manage capability (P-B)", () => {
  test("customers.manage 키가 registry에 존재", () => {
    expect(PERMISSIONS).toContain("customers.manage");
  });
  test("users.manage 보유자는 customers.manage도 통과(슈퍼권한)", () => {
    expect(can(["users.manage"], "customers.manage")).toBe(true);
  });
  test("customers.manage만 보유 시 customers.manage 통과, equipment.manage 불가", () => {
    expect(can(["customers.manage"], "customers.manage")).toBe(true);
    expect(can(["customers.manage"], "equipment.manage")).toBe(false);
  });
});

describe("consumables.manage capability (P-C)", () => {
  test("consumables.manage 키가 registry에 존재", () => {
    expect(PERMISSIONS).toContain("consumables.manage");
  });
  test("users.manage 보유자는 consumables.manage도 통과(슈퍼권한)", () => {
    expect(can(["users.manage"], "consumables.manage")).toBe(true);
  });
  test("consumables.manage만 보유 시 통과, customers.manage 불가", () => {
    expect(can(["consumables.manage"], "consumables.manage")).toBe(true);
    expect(can(["consumables.manage"], "customers.manage")).toBe(false);
  });
});

describe("service_requests capabilities (P-D)", () => {
  test("view_all·manage 키가 registry에 존재", () => {
    expect(PERMISSIONS).toContain("service_requests.view_all");
    expect(PERMISSIONS).toContain("service_requests.manage");
  });
  test("users.manage 보유자는 둘 다 통과(슈퍼권한)", () => {
    expect(can(["users.manage"], "service_requests.view_all")).toBe(true);
    expect(can(["users.manage"], "service_requests.manage")).toBe(true);
  });
  test("view_all만 보유 시 view_all 통과, manage 불가", () => {
    expect(can(["service_requests.view_all"], "service_requests.view_all")).toBe(true);
    expect(can(["service_requests.view_all"], "service_requests.manage")).toBe(false);
  });
});
