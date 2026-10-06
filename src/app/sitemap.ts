import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-config";

// Deliberately just the homepage — individual published forms (/[slug])
// aren't listed here even though they're crawlable (see robots.ts).
// Tournament/event registration links are usually meant to be shared
// directly with participants, not surfaced to strangers via search, so
// they're left out of the sitemap rather than opted in by default.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
