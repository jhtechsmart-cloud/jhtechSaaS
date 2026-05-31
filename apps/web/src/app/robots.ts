import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo/site";

// 공개 크롤 허용 + /admin 차단 + sitemap 포인터.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/admin" },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
