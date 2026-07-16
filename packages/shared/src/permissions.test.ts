import { describe, expect, test } from "vitest";
import {
  ADMIN_PRESET,
  PERMISSION_REGISTRY,
  PERMISSIONS,
  SALES_PRESET,
  can,
} from "./permissions";

describe("permission registry", () => {
  // E5a: capability registry. *.manage 3키는 step6에서 분해·삭제됨. 새 기능마다 키 추가, 스키마 변경 0.
  test("registry는 22개 capability 키를 정의한다", () => {
    expect([...PERMISSIONS].sort()).toEqual(
      [
        "demo_reservations.write",
        "applications.view_all",
        "applications.assign",
        "applications.status",
        "applications.claim",
        "quotes.write",
        "email.send",
        "release_orders.write",
        "customers.edit",
        "customers.delete",
        "customers.view_all",
        "service_requests.view_all",
        "service_requests.status",
        "service_requests.claim",
        "service_reports.write",
        "service_reports.view_all",
        "supply_requests.view_all",
        "supply_requests.status",
        "supply_requests.claim",
        "equipment.manage",
        "consumables.manage",
        "users.manage",
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

describe("은퇴(deprecated) 키 — E5a step6에서 전부 삭제됨", () => {
  test("deprecated 키는 더 이상 없다(빈 집합)", () => {
    const deprecated = PERMISSION_REGISTRY.filter((p) => p.deprecated).map(
      (p) => p.key,
    );
    expect(deprecated).toEqual([]);
  });

  test("삭제된 *.manage 3키는 registry에 없다", () => {
    for (const gone of [
      "customers.manage",
      "service_requests.manage",
      "supply_requests.manage",
    ]) {
      expect(PERMISSIONS).not.toContain(gone);
    }
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
  test("정확히 11키로 구성된다", () => {
    expect([...SALES_PRESET].sort()).toEqual(
      [
        "applications.status",
        "applications.claim",
        "quotes.write",
        "customers.edit",
        "email.send",
        "release_orders.write",
        "service_requests.status",
        "service_requests.claim",
        "supply_requests.status",
        "supply_requests.claim",
        "demo_reservations.write",
      ].sort(),
    );
  });

  test("데모예약 쓰기 키가 registry·프리셋에 존재한다", () => {
    expect(PERMISSIONS).toContain("demo_reservations.write");
    expect(SALES_PRESET).toContain("demo_reservations.write");
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

describe("customers capabilities (P-B → E5a 분해)", () => {
  test("edit/delete/view_all 키가 registry에 존재", () => {
    expect(PERMISSIONS).toContain("customers.edit");
    expect(PERMISSIONS).toContain("customers.delete");
    expect(PERMISSIONS).toContain("customers.view_all");
  });
  test("users.manage 보유자는 전부 통과(슈퍼권한)", () => {
    expect(can(["users.manage"], "customers.delete")).toBe(true);
  });
  test("customers.edit만 보유 시 edit 통과, delete·equipment.manage 불가", () => {
    expect(can(["customers.edit"], "customers.edit")).toBe(true);
    expect(can(["customers.edit"], "customers.delete")).toBe(false);
    expect(can(["customers.edit"], "equipment.manage")).toBe(false);
  });
});

describe("consumables.manage capability (P-C)", () => {
  test("consumables.manage 키가 registry에 존재", () => {
    expect(PERMISSIONS).toContain("consumables.manage");
  });
  test("users.manage 보유자는 consumables.manage도 통과(슈퍼권한)", () => {
    expect(can(["users.manage"], "consumables.manage")).toBe(true);
  });
  test("consumables.manage만 보유 시 통과, customers.edit 불가", () => {
    expect(can(["consumables.manage"], "consumables.manage")).toBe(true);
    expect(can(["consumables.manage"], "customers.edit")).toBe(false);
  });
});

describe("service_requests capabilities (P-D → E5a 분해)", () => {
  test("view_all·status·claim 키가 registry에 존재(manage 삭제됨)", () => {
    expect(PERMISSIONS).toContain("service_requests.view_all");
    expect(PERMISSIONS).toContain("service_requests.status");
    expect(PERMISSIONS).toContain("service_requests.claim");
  });
  test("users.manage 보유자는 전부 통과(슈퍼권한)", () => {
    expect(can(["users.manage"], "service_requests.view_all")).toBe(true);
    expect(can(["users.manage"], "service_requests.status")).toBe(true);
  });
  test("view_all만 보유 시 view_all 통과, status 불가(분리)", () => {
    expect(can(["service_requests.view_all"], "service_requests.view_all")).toBe(true);
    expect(can(["service_requests.view_all"], "service_requests.status")).toBe(false);
  });
});

describe("supply_requests capabilities (P-E → E5a 분해)", () => {
  test("view_all·status·claim 키가 registry에 존재(manage 삭제됨)", () => {
    expect(PERMISSIONS).toContain("supply_requests.view_all");
    expect(PERMISSIONS).toContain("supply_requests.status");
    expect(PERMISSIONS).toContain("supply_requests.claim");
  });
  test("users.manage 보유자는 전부 통과(슈퍼권한)", () => {
    expect(can(["users.manage"], "supply_requests.view_all")).toBe(true);
    expect(can(["users.manage"], "supply_requests.status")).toBe(true);
  });
  test("view_all만 보유 시 view_all 통과, status 불가(분리)", () => {
    expect(can(["supply_requests.view_all"], "supply_requests.view_all")).toBe(true);
    expect(can(["supply_requests.view_all"], "supply_requests.status")).toBe(false);
  });
});
