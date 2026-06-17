import { describe, expect, it } from "vitest";
import { pickQuoteEquipmentId } from "./quote-equipment";

describe("pickQuoteEquipmentId", () => {
  it("견적 items[0].equipmentId 우선", () => {
    expect(pickQuoteEquipmentId([{ equipmentId: "A" }], "B")).toBe("A");
  });
  it("items에 equipmentId 없으면 의뢰 장비로 폴백", () => {
    expect(pickQuoteEquipmentId([{ name: "x" }], "B")).toBe("B");
  });
  it("둘 다 없으면 null", () => {
    expect(pickQuoteEquipmentId([], null)).toBeNull();
    expect(pickQuoteEquipmentId(null, null)).toBeNull();
  });
  it("items가 배열 아니어도 안전(의뢰 장비 폴백)", () => {
    expect(pickQuoteEquipmentId(undefined, "B")).toBe("B");
  });
});
