import { describe, expect, test } from "vitest";
import {
  buildPermissionGroups,
  detectPermissionMode,
  sanitizePermissions,
} from "./permissions-ui";
import { ADMIN_PRESET, SALES_PRESET } from "@jhtechsaas/shared";

describe("detectPermissionMode — 프리셋 시드 상태 판별", () => {
  test("프리셋과 정확히 일치하면 해당 모드(순서 무관)", () => {
    expect(detectPermissionMode([...SALES_PRESET])).toBe("sales");
    expect(detectPermissionMode([...SALES_PRESET].reverse())).toBe("sales");
    expect(detectPermissionMode([...ADMIN_PRESET])).toBe("admin");
  });

  test("프리셋에서 하나라도 빼거나 더하면 custom으로 이탈", () => {
    expect(detectPermissionMode(SALES_PRESET.slice(1))).toBe("custom");
    expect(detectPermissionMode([...SALES_PRESET, "users.manage"])).toBe("custom");
    expect(detectPermissionMode([])).toBe("custom");
  });
});

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
