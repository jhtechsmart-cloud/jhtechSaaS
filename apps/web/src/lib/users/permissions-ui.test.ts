import { describe, expect, test } from "vitest";
import { buildPermissionGroups, sanitizePermissions } from "./permissions-ui";
import { SALES_PRESET } from "@jhtechsaas/shared";

describe("sanitizePermissions — 배정 가능한 유효 키만", () => {
  test("미지의 키·중복 제거", () => {
    expect(
      sanitizePermissions(["applications.claim", "applications.claim", "garbage.key"]),
    ).toEqual(["applications.claim"]);
  });

  test("deprecated 키(customers.manage)는 배정 불가 → 제거", () => {
    expect(sanitizePermissions(["customers.manage", "customers.edit"])).toEqual([
      "customers.edit",
    ]);
  });

  test("SALES_PRESET 전부 유효 → 동일 집합 유지", () => {
    expect(new Set(sanitizePermissions([...SALES_PRESET]))).toEqual(new Set(SALES_PRESET));
  });
});

describe("buildPermissionGroups — 그리드용 그룹 묶음", () => {
  test("deprecated 제외, 그룹별 묶음, 빈 그룹 없음", () => {
    const groups = buildPermissionGroups();
    const allKeys = groups.flatMap((g) => g.items.map((i) => i.key));
    expect(allKeys).not.toContain("customers.manage"); // deprecated 제외
    expect(allKeys).toContain("users.manage");
    expect(groups.map((g) => g.group)).toContain("견적");
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
  });
});
