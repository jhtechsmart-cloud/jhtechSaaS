import { describe, expect, test } from "vitest";
import {
  ADMIN_PRESET,
  PERMISSION_REGISTRY,
  PERMISSIONS,
  SALES_PRESET,
  can,
} from "./permissions";

describe("permission registry", () => {
  // E5a: capability registry — 기존 12 + 신규 9 = 21키. 새 기능마다 키 추가, 스키마 변경 0.
  test("registry는 21개 capability 키를 정의한다", () => {
    expect([...PERMISSIONS].sort()).toEqual(
      [
        // 기존 12
        "applications.assign",
        "applications.view_all",
        "consumables.manage",
        "customers.manage",
        "email.send",
        "equipment.manage",
        "quotes.write",
        "service_requests.manage",
        "service_requests.view_all",
        "supply_requests.manage",
        "supply_requests.view_all",
        "users.manage",
        // 신규 9 (E5a)
        "applications.status",
        "applications.claim",
        "customers.edit",
        "customers.delete",
        "customers.view_all",
        "service_requests.status",
        "service_requests.claim",
        "supply_requests.status",
        "supply_requests.claim",
      ].sort(),
    );
  });

  test("PERMISSIONS는 PERMISSION_REGISTRY에서 파생된다(키 집합 일치)", () => {
    expect([...PERMISSIONS].sort()).toEqual(
      PERMISSION_REGISTRY.map((p) => p.key).sort(),
    );
  });

  test("registry 항목은 중복 키가 없다", () => {
    const keys = PERMISSION_REGISTRY.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("registry 메타 ({label, description, group})", () => {
  test("모든 키가 label/description/group을 가진다", () => {
    for (const p of PERMISSION_REGISTRY) {
      expect(p.label, `${p.key} label`).toBeTruthy();
      expect(p.description, `${p.key} description`).toBeTruthy();
      expect(p.group, `${p.key} group`).toBeTruthy();
    }
  });

  test("label은 한글(비-ASCII)이다", () => {
    for (const p of PERMISSION_REGISTRY) {
      expect(/[^\x00-\x7F]/.test(p.label), `${p.key} label=${p.label}`).toBe(
        true,
      );
    }
  });
});

describe("은퇴(deprecated) 키 — E5a step1에선 유지, step6에서 삭제", () => {
  test("deprecated 키는 정확히 customers/service/supply의 .manage 3종", () => {
    const deprecated = PERMISSION_REGISTRY.filter((p) => p.deprecated).map(
      (p) => p.key,
    );
    expect([...deprecated].sort()).toEqual(
      [
        "customers.manage",
        "service_requests.manage",
        "supply_requests.manage",
      ].sort(),
    );
  });

  test("신규 키는 deprecated가 아니다", () => {
    const byKey = new Map(PERMISSION_REGISTRY.map((p) => [p.key, p]));
    for (const key of [
      "applications.status",
      "applications.claim",
      "customers.edit",
      "customers.delete",
      "customers.view_all",
      "service_requests.status",
      "service_requests.claim",
      "supply_requests.status",
      "supply_requests.claim",
    ] as const) {
      expect(byKey.get(key)?.deprecated, key).toBeFalsy();
    }
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

describe("신규 9키 — can() 동작 + users.manage 우회", () => {
  const NEW_KEYS = [
    "applications.status",
    "applications.claim",
    "customers.edit",
    "customers.delete",
    "customers.view_all",
    "service_requests.status",
    "service_requests.claim",
    "supply_requests.status",
    "supply_requests.claim",
  ] as const;

  test("각 신규 키는 자기 키 보유 시 통과", () => {
    for (const key of NEW_KEYS) {
      expect(can([key], key), key).toBe(true);
    }
  });

  test("users.manage 보유자는 모든 신규 키 통과", () => {
    for (const key of NEW_KEYS) {
      expect(can(["users.manage"], key), key).toBe(true);
    }
  });

  test("타 키 보유로는 신규 키 미통과 (분리 확인)", () => {
    expect(can(["customers.edit"], "customers.delete")).toBe(false);
    expect(can(["applications.status"], "applications.claim")).toBe(false);
  });
});

describe("SALES_PRESET (영업담당 프리셋)", () => {
  test("정확히 9키로 구성된다", () => {
    expect([...SALES_PRESET].sort()).toEqual(
      [
        "applications.status",
        "applications.claim",
        "quotes.write",
        "customers.edit",
        "email.send",
        "service_requests.status",
        "service_requests.claim",
        "supply_requests.status",
        "supply_requests.claim",
      ].sort(),
    );
  });

  test("영업이 못 하는 권한은 미포함 (view_all/assign/delete/users)", () => {
    for (const forbidden of [
      "applications.view_all",
      "applications.assign",
      "customers.delete",
      "customers.view_all",
      "service_requests.assign",
      "users.manage",
      "equipment.manage",
      "consumables.manage",
    ]) {
      expect(SALES_PRESET).not.toContain(forbidden);
    }
  });

  test("모든 프리셋 키는 registry에 존재한다", () => {
    const keys = new Set(PERMISSIONS);
    for (const key of SALES_PRESET) {
      expect(keys.has(key), key).toBe(true);
    }
  });
});

describe("ADMIN_PRESET (관리자 프리셋)", () => {
  test("users.manage 단일 super 권한", () => {
    expect([...ADMIN_PRESET]).toEqual(["users.manage"]);
  });

  test("ADMIN_PRESET 보유자는 임의 키 통과(super)", () => {
    expect(can([...ADMIN_PRESET], "customers.delete")).toBe(true);
    expect(can([...ADMIN_PRESET], "applications.status")).toBe(true);
  });
});

describe("customers.manage capability (P-B, deprecated)", () => {
  test("customers.manage 키가 registry에 존재(유지)", () => {
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
    expect(can(["service_requests.view_all"], "service_requests.view_all")).toBe(
      true,
    );
    expect(can(["service_requests.view_all"], "service_requests.manage")).toBe(
      false,
    );
  });
});

describe("supply_requests capabilities (P-E)", () => {
  test("view_all·manage 키가 registry에 존재", () => {
    expect(PERMISSIONS).toContain("supply_requests.view_all");
    expect(PERMISSIONS).toContain("supply_requests.manage");
  });
  test("users.manage 보유자는 둘 다 통과(슈퍼권한)", () => {
    expect(can(["users.manage"], "supply_requests.view_all")).toBe(true);
    expect(can(["users.manage"], "supply_requests.manage")).toBe(true);
  });
  test("view_all만 보유 시 view_all 통과, manage 불가", () => {
    expect(can(["supply_requests.view_all"], "supply_requests.view_all")).toBe(
      true,
    );
    expect(can(["supply_requests.view_all"], "supply_requests.manage")).toBe(
      false,
    );
  });
});
