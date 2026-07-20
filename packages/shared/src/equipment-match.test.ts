import { describe, expect, it, test } from "vitest";
import {
  catalogDeviceLabel,
  EQUIPMENT_KEY_VECTORS,
  matchEquipmentName,
  normalizeEquipmentKey,
} from "./equipment-match";

const list = [
  { name: "롤 UV 프린터 (1.6m)", model: "XTRA R16" },
  { name: "멀티컷 에코 SG1625 Digital Cutter", model: "SG1625" },
];

describe("matchEquipmentName", () => {
  test("이름 정규화 매칭(공백·기호 무시)", () => {
    expect(matchEquipmentName("롤 UV 프린터(1.6m)", list)?.model).toBe("XTRA R16");
  });
  test("모델명 매칭", () => {
    expect(matchEquipmentName("SG1625", list)?.model).toBe("SG1625");
  });
  test("미매칭은 null", () => {
    expect(matchEquipmentName("없는장비", list)).toBeNull();
    expect(matchEquipmentName("", list)).toBeNull();
  });
});

describe("catalogDeviceLabel — 동명 카탈로그 구분", () => {
  it("모델이 이름과 다르면 괄호로 병기(동명 2행 구분)", () => {
    expect(catalogDeviceLabel("대형 롤투롤 UV 프린터", "XTRA 5000")).toBe("대형 롤투롤 UV 프린터 (XTRA 5000)");
    expect(catalogDeviceLabel("대형 롤투롤 UV 프린터", "XTRA 3300S")).toBe("대형 롤투롤 UV 프린터 (XTRA 3300S)");
  });

  it("모델이 이름에 이미 녹아 있으면 덧붙이지 않음", () => {
    expect(catalogDeviceLabel("XTRA 3300H", "XTRA-3300H")).toBe("XTRA 3300H");
    expect(catalogDeviceLabel("멀티컷 SG1625", "SG1625")).toBe("멀티컷 SG1625");
  });

  it("모델이 비면 이름만", () => {
    expect(catalogDeviceLabel("특수장비", null)).toBe("특수장비");
    expect(catalogDeviceLabel("특수장비", "  ")).toBe("특수장비");
  });
});

describe("EQUIPMENT_KEY_VECTORS — SQL 정규화와 동일 규칙", () => {
  it("모든 벡터가 normalizeEquipmentKey 결과와 일치", () => {
    for (const v of EQUIPMENT_KEY_VECTORS) {
      expect(normalizeEquipmentKey(v.input)).toBe(v.key);
    }
  });
});
