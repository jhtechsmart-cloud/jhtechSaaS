import type { Metadata } from "next";
import type { EquipmentPublic } from "@jhtechsaas/shared";
import { buildPublicImageUrl } from "@/lib/equipment/images";

const COMPANY = "(주)재현테크";

// 상세 description: 카테고리·모델·대표 스펙(최대 2) 한 줄. 부가정보 없으면 기본 문구.
export function buildEquipmentDescription(eq: EquipmentPublic): string {
  const parts: string[] = [];
  if (eq.category) parts.push(eq.category);
  if (eq.model) parts.push(eq.model);
  // 그룹 사양을 평탄화해 대표 항목 최대 2개를 description에 사용.
  const items = eq.specs.flatMap((g) => g.items);
  for (const s of items.slice(0, 2)) {
    if (s.label && s.value) parts.push(`${s.label} ${s.value}`);
  }
  const detail = parts.join(" · ");
  return detail ? `${eq.name} — ${detail}` : `${eq.name} 상세 정보`;
}

// 장비 상세 Metadata. siteUrl·supabaseUrl 주입(순수성·테스트 용이). OG 이미지는 절대 URL.
export function buildEquipmentMetadata(
  eq: EquipmentPublic,
  siteUrl: string,
  supabaseUrl: string,
): Metadata {
  const description = buildEquipmentDescription(eq);
  const images = eq.photos.length
    ? [buildPublicImageUrl(supabaseUrl, eq.photos[0])]
    : [];
  return {
    title: eq.name,
    description,
    alternates: { canonical: `${siteUrl}/equipment/${eq.id}` },
    openGraph: {
      title: `${eq.name} | ${COMPANY}`,
      description,
      url: `${siteUrl}/equipment/${eq.id}`,
      images,
      type: "website",
    },
  };
}
