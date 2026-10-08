// Single source of truth for the public site's own URL — used by
// metadataBase (layout.tsx), robots.ts, sitemap.ts, and the homepage's
// structured data, so there's one place to change if the domain ever does.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://form.codactics.com").replace(
  /\/$/,
  "",
);

export const SITE_NAME = "Codactics Form Builder";
export const SITE_DESCRIPTION =
  "Codactics Form is a free online form builder by Team Codactics for tournament and event registration — build, publish, and collect responses in minutes, with access codes, file uploads, e-signatures, and exports to Google Sheets.";
