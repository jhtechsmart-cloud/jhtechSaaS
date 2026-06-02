import { describe, expect, test } from "vitest";
import { consumableFormSchema, consumableScopeRowSchema } from "./schema";

describe("consumableScopeRowSchema — category XOR equipment_id", () => {
  const base = { id: "", category: "", equipment_id: "" };
  test("category만 → 통과", () => {
    expect(consumableScopeRowSchema.safeParse({ ...base, category: "UV프린터" }).success).toBe(true);
  });
  test("equipment_id만 → 통과", () => {
    expect(consumableScopeRowSchema.safeParse({ ...base, equipment_id: "22222222-2222-4222-a222-222222222222" }).success).toBe(true);
  });
  test("둘 다 → 실패", () => {
    expect(consumableScopeRowSchema.safeParse({ ...base, category: "UV프린터", equipment_id: "22222222-2222-4222-a222-222222222222" }).success).toBe(false);
  });
  test("둘 다 없음 → 실패", () => {
    expect(consumableScopeRowSchema.safeParse(base).success).toBe(false);
  });
});

describe("consumableFormSchema", () => {
  test("name 필수", () => {
    expect(consumableFormSchema.safeParse({ name: "" }).success).toBe(false);
  });
  test("최소 폼(name만) → 기본값 채워짐", () => {
    const r = consumableFormSchema.safeParse({ name: "세정액" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe("active");
      expect(r.data.scopes).toEqual([]);
      expect(r.data.price).toBe("");
    }
  });
  test("price는 빈 값 또는 0 이상 숫자만", () => {
    expect(consumableFormSchema.safeParse({ name: "x", price: "abc" }).success).toBe(false);
    expect(consumableFormSchema.safeParse({ name: "x", price: "-5" }).success).toBe(false);
    expect(consumableFormSchema.safeParse({ name: "x", price: "1500" }).success).toBe(true);
    expect(consumableFormSchema.safeParse({ name: "x", price: "" }).success).toBe(true);
    // 무료(0) 및 소수점 가격도 허용
    expect(consumableFormSchema.safeParse({ name: "x", price: "0" }).success).toBe(true);
    expect(consumableFormSchema.safeParse({ name: "x", price: "0.5" }).success).toBe(true);
  });
  test("status는 active|inactive만", () => {
    expect(consumableFormSchema.safeParse({ name: "x", status: "bogus" }).success).toBe(false);
  });
});
