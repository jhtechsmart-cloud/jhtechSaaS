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
