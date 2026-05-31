import type { MetadataRoute } from "next";
import { listPublicEquipment } from "@/lib/equipment/public-queries";
import { buildSitemapEntries } from "@/lib/seo/sitemap-entries";
import { siteUrl } from "@/lib/seo/site";

// 동적 sitemap — active 장비 상세 포함.
// force-dynamic: 빌드 타임 정적 prerender를 막아 항상 런타임 생성(신선도).
// 이게 없으면 listPublicEquipment의 cookies() 동적신호를 아래 try/catch가 삼켜
// 라우트가 정적으로 굳고 장비 URL이 누락될 수 있음.
export const dynamic = "force-dynamic";

// DB 일시 장애 시 정적 엔트리(/, /equipment)만 반환해 500 방지.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = siteUrl();
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${url}/`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${url}/equipment`, changeFrequency: "weekly", priority: 0.8 },
  ];
  try {
    const items = await listPublicEquipment();
    return buildSitemapEntries(
      items.map((e) => e.id),
      url,
    );
  } catch (err) {
    console.error("[sitemap] 장비 목록 조회 실패", err);
    return staticEntries;
  }
}
