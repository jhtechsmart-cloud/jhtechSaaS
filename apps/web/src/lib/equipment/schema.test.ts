import { describe, it, expect } from "vitest";
import { equipmentFormSchema } from "./schema";

const base = {
  name: "포장기 A",
  model: "PK-100",
  category: "포장",
  base_price: 1000000,
  status: "active" as const,
  youtube_url: "",
};

describe("equipmentFormSchema", () => {
  it("정상 입력 통과", () => {
    expect(equipmentFormSchema.safeParse(base).success).toBe(true);
  });
  it("name 빈값 거부", () => {
    expect(equipmentFormSchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });
  it("base_price 음수 거부", () => {
    expect(
      equipmentFormSchema.safeParse({ ...base, base_price: -1 }).success,
    ).toBe(false);
  });
  it("status는 active/inactive만", () => {
    expect(
      equipmentFormSchema.safeParse({ ...base, status: "foo" }).success,
    ).toBe(false);
  });
  it("youtube_url 빈 문자열 허용(선택)", () => {
    expect(
      equipmentFormSchema.safeParse({ ...base, youtube_url: "" }).success,
    ).toBe(true);
  });
  it("youtube_url 잘못된 URL 거부", () => {
    expect(
      equipmentFormSchema.safeParse({ ...base, youtube_url: "not a url" }).success,
    ).toBe(false);
  });
  it("model·category 선택(빈값 허용)", () => {
    expect(
      equipmentFormSchema.safeParse({ ...base, model: "", category: "" }).success,
    ).toBe(true);
  });
});

describe("equipmentFormSchema — 동적 필드(P3)", () => {
  it("specs·photos·options 미지정 시 기본값(빈 배열)", () => {
    const r = equipmentFormSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.specs).toEqual([]);
      expect(r.data.photos).toEqual([]);
      expect(r.data.options).toEqual([]);
    }
  });
  it("specs 행(빈 값 허용)", () => {
    const r = equipmentFormSchema.safeParse({
      ...base,
      specs: [{ label: "전압", value: "220V" }, { label: "", value: "" }],
    });
    expect(r.success).toBe(true);
  });
  it("photos는 문자열 배열", () => {
    expect(
      equipmentFormSchema.safeParse({ ...base, photos: ["equipment/x/y.jpg"] }).success,
    ).toBe(true);
    expect(
      equipmentFormSchema.safeParse({ ...base, photos: [1] }).success,
    ).toBe(false);
  });
  it("option kind는 included/extra만", () => {
    expect(
      equipmentFormSchema.safeParse({
        ...base,
        options: [{ kind: "included", name: "받침대", price: 0 }],
      }).success,
    ).toBe(true);
    expect(
      equipmentFormSchema.safeParse({
        ...base,
        options: [{ kind: "foo", name: "x", price: 0 }],
      }).success,
    ).toBe(false);
  });
  it("option price 음수 거부", () => {
    expect(
      equipmentFormSchema.safeParse({
        ...base,
        options: [{ kind: "extra", name: "x", price: -1 }],
      }).success,
    ).toBe(false);
  });
});
