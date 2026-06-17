import { describe, it, expect, test } from "vitest";
import { equipmentFormSchema } from "./schema";

// 신규 스키마 기준 base: youtube_urls 배열, specs 그룹형
const base = {
  name: "포장기 A",
  model: "PK-100",
  category: "포장",
  base_price: 1000000,
  status: "active" as const,
  highlights: [] as string[],
  youtube_urls: [] as string[],
  specs: [] as Array<{ group: string; icon: string; items: Array<{ label: string; value: string }> }>,
  photos: [] as string[],
  options: [] as Array<{ kind: "included" | "extra"; name: string; price: number }>,
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
  it("model·category 선택(빈값 허용)", () => {
    expect(
      equipmentFormSchema.safeParse({ ...base, model: "", category: "" }).success,
    ).toBe(true);
  });
});

describe("equipmentFormSchema — 동적 필드(P-A)", () => {
  it("specs·photos·options·highlights·youtube_urls 미지정 시 기본값(빈 배열)", () => {
    // base 없이 최소 필드만 파싱
    const r = equipmentFormSchema.safeParse({
      name: "포장기 A",
      model: "PK-100",
      category: "포장",
      base_price: 1000000,
      status: "active",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.specs).toEqual([]);
      expect(r.data.photos).toEqual([]);
      expect(r.data.options).toEqual([]);
      expect(r.data.highlights).toEqual([]);
      expect(r.data.youtube_urls).toEqual([]);
    }
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

// ─── P-A 신규 필드 테스트 ───────────────────────────────────────────────────

test("youtube_urls 배열: YouTube 호스트만 통과", () => {
  const ok = equipmentFormSchema.safeParse({
    name: "장비", model: "", category: "", base_price: 0, status: "active",
    highlights: ["가벼움"], youtube_urls: ["https://youtu.be/abc"],
    specs: [], photos: [], options: [],
  });
  expect(ok.success).toBe(true);
});

test("youtube_urls에 비유튜브 URL 있으면 실패", () => {
  const bad = equipmentFormSchema.safeParse({
    name: "장비", model: "", category: "", base_price: 0, status: "active",
    highlights: [], youtube_urls: ["https://evil.com/x"],
    specs: [], photos: [], options: [],
  });
  expect(bad.success).toBe(false);
});

test("specs 그룹형: group+icon(enum)+items 통과", () => {
  const ok = equipmentFormSchema.safeParse({
    name: "장비", model: "", category: "", base_price: 0, status: "active",
    highlights: [], youtube_urls: [],
    specs: [{ group: "성능", icon: "gauge", items: [{ label: "속도", value: "10" }] }],
    photos: [], options: [],
  });
  expect(ok.success).toBe(true);
});

test("specs icon이 enum 밖이면 실패", () => {
  const bad = equipmentFormSchema.safeParse({
    name: "장비", model: "", category: "", base_price: 0, status: "active",
    highlights: [], youtube_urls: [],
    specs: [{ group: "x", icon: "nope", items: [] }],
    photos: [], options: [],
  });
  expect(bad.success).toBe(false);
});

describe("catalog_pdf", () => {
  it("올바른 경로 통과", () => {
    expect(
      equipmentFormSchema.safeParse({
        ...base,
        catalog_pdf: "equipment/11111111-1111-1111-1111-111111111111/catalog.pdf",
      }).success,
    ).toBe(true);
  });
  it("빈 문자열 허용(기본)", () => {
    expect(equipmentFormSchema.safeParse({ ...base, catalog_pdf: "" }).success).toBe(true);
  });
  it("미지정 시 기본값 빈 문자열", () => {
    const r = equipmentFormSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.catalog_pdf).toBe("");
  });
  it("잘못된 경로 거부", () => {
    expect(
      equipmentFormSchema.safeParse({ ...base, catalog_pdf: "equipment/x/bad.pdf" }).success,
    ).toBe(false);
  });
});
