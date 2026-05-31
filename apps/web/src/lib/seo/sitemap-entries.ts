import type { MetadataRoute } from "next";

// 동적 sitemap 엔트리(순수). 정적 경로 + active 장비 상세. URL은 절대.
export function buildSitemapEntries(
  equipmentIds: string[],
  siteUrl: string,
): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/equipment`, changeFrequency: "weekly", priority: 0.8 },
  ];
  const detail: MetadataRoute.Sitemap = equipmentIds.map((id) => ({
    url: `${siteUrl}/equipment/${id}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));
  return [...staticEntries, ...detail];
}
