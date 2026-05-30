import type { MetadataRoute } from "next";
import { listPublicEquipment } from "@/lib/equipment/public-queries";
import { buildSitemapEntries } from "@/lib/seo/sitemap-entries";
import { siteUrl } from "@/lib/seo/site";

// 동적 sitemap — active 장비 상세 포함.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const items = await listPublicEquipment();
  return buildSitemapEntries(
    items.map((e) => e.id),
    siteUrl(),
  );
}
