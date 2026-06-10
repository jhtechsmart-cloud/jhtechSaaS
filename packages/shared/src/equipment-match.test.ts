import { describe, expect, test } from "vitest";
import { matchEquipmentName } from "./equipment-match";

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
