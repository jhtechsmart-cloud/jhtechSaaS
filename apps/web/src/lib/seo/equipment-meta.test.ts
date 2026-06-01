import { describe, it, expect } from "vitest";
import type { EquipmentPublic } from "@jhtechsaas/shared";
import { buildEquipmentDescription, buildEquipmentMetadata } from "./equipment-meta";

const base: EquipmentPublic = {
  id: "eq-1",
  name: "전자동 포장기",
  model: "PK-200",
  category: "포장기",
  photos: ["equipment/eq-1/cover.jpg"],
  highlights: ["고속 포장", "자동 정렬"],
  specs: [
    {
      group: "기본",
      icon: "settings",
      items: [
        { label: "전압", value: "220V" },
        { label: "출력", value: "3kW" },
        { label: "무게", value: "120kg" },
      ],
    },
  ],
  youtube_urls: [],
  created_at: "2026-05-30T00:00:00Z",
};

describe("buildEquipmentDescription", () => {
  it("카테고리·모델·대표 스펙 2개를 한 줄로", () => {
    expect(buildEquipmentDescription(base)).toBe(
      "전자동 포장기 — 포장기 · PK-200 · 전압 220V · 출력 3kW",
    );
  });
  it("부가정보 없으면 기본 문구", () => {
    const bare = { ...base, model: null, category: null, specs: [] };
    expect(buildEquipmentDescription(bare)).toBe("전자동 포장기 상세 정보");
  });
});

describe("buildEquipmentMetadata", () => {
  it("title·canonical·OG(절대 이미지 URL)", () => {
    const m = buildEquipmentMetadata(base, "https://jh.example.com", "https://x.supabase.co");
    expect(m.title).toBe("전자동 포장기");
    expect(m.alternates?.canonical).toBe("https://jh.example.com/equipment/eq-1");
    expect(m.openGraph?.images).toEqual([
      "https://x.supabase.co/storage/v1/object/public/equipment-images/equipment/eq-1/cover.jpg",
    ]);
  });
  it("사진 0장이면 OG 이미지 빈 배열", () => {
    const m = buildEquipmentMetadata({ ...base, photos: [] }, "https://jh.example.com", "https://x.supabase.co");
    expect(m.openGraph?.images).toEqual([]);
  });
});
