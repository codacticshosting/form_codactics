import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Admin tooling and auth routes have nothing for a search engine to
        // index and shouldn't show up in results. Published forms (/[slug])
        // stay crawlable — they're the public-facing pages.
        disallow: ["/admin", "/api", "/login"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
