import { describe, expect, test } from "vitest";
import { PERMISSIONS, can } from "./permissions";

describe("permission registry", () => {
  // v1 capability registry — 새 기능마다 키 1개 추가, 스키마 변경 0.
  test("v1 registry는 6개 capability 키를 정의한다", () => {
    expect([...PERMISSIONS].sort()).toEqual(
      [
        "applications.assign",
        "applications.view_all",
        "email.send",
        "equipment.manage",
        "quotes.write",
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
