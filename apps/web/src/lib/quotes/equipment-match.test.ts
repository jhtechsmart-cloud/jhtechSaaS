// 견적 item 이름 ↔ 장비 카탈로그 매칭 — 서버 의존 없이 단위테스트.
import { describe, expect, test } from "vitest";
import { matchEquipmentName, type MatchableEquipment } from "./equipment-match";

const eq = (over: Partial<MatchableEquipment>): MatchableEquipment => ({
  id: "id", name: "JP1113", model: "JP1113", category: "평판커팅기", photos: [], basePrice: 0, ...over,
});

describe("matchEquipmentName — 이름/모델 정규화 대조", () => {
  const list = [
    eq({ id: "a", name: "JP1113", model: "JP1113" }),
    eq({ id: "b", name: "XTRA R16", model: "R16", category: "라우터" }),
  ];
  test("정확히 일치하면 그 장비", () => { expect(matchEquipmentName("JP1113", list)?.id).toBe("a"); });
  test("모델로도 매칭", () => { expect(matchEquipmentName("R16", list)?.id).toBe("b"); });
  test("대소문자·공백·하이픈 무시", () => { expect(matchEquipmentName("xtra-r 16", list)?.id).toBe("b"); });
  test("미매칭이면 null", () => { expect(matchEquipmentName("없는장비", list)).toBeNull(); });
  test("빈 이름이면 null", () => { expect(matchEquipmentName("", list)).toBeNull(); });
});
