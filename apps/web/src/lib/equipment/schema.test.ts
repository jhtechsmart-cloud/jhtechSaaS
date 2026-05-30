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
  it("youtube_url 유튜브 호스트만 허용", () => {
    expect(
      equipmentFormSchema.safeParse({ ...base, youtube_url: "https://youtu.be/abc" })
        .success,
    ).toBe(true);
    expect(
      equipmentFormSchema.safeParse({
        ...base,
        youtube_url: "https://www.youtube.com/watch?v=abc",
      }).success,
    ).toBe(true);
    // 비-유튜브·위험 스킴 거부(stored-XSS 방지)
    expect(
      equipmentFormSchema.safeParse({ ...base, youtube_url: "https://evil.com/x" })
        .success,
    ).toBe(false);
    expect(
      equipmentFormSchema.safeParse({ ...base, youtube_url: "javascript:alert(1)" })
        .success,
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
  it("photos는 equipment/{uuid}/{uuid}.{ext} 형식만 허용", () => {
    const valid =
      "equipment/00000000-0000-0000-0000-000000000000/11111111-1111-1111-1111-111111111111.jpg";
    expect(
      equipmentFormSchema.safeParse({ ...base, photos: [valid] }).success,
    ).toBe(true);
    // 형식 불일치 경로 거부(경로조작·타 객체 삭제 방지)
    expect(
      equipmentFormSchema.safeParse({ ...base, photos: ["equipment/x/y.jpg"] }).success,
    ).toBe(false);
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
