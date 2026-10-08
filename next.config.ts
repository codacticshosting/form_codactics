import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Content-Security-Policy for every page. Without nonces (see the Next.js
// CSP guide), so pages can stay statically rendered — which means inline
// scripts have to be allowed for Next.js's own bootstrapping. The rest is
// locked to this site:
//  - img-src allows any https image: admins can put pictures from other
//    sites into Markdown text, and Drive-stored form images come from
//    lh3.googleusercontent.com. An image can't run script.
//  - form-action includes Google, because signing in posts a form that
//    redirects to Google's sign-in page.
//  - frame-ancestors 'self': no other site may embed these pages
//    (clickjacking protection).
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

// For responses that are only ever images: nothing may run or load.
const IMAGE_ONLY_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // HTTPS only, for two years, once a browser has seen the site.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Older browsers' equivalent of frame-ancestors.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing on the site uses these; photo uploads go through the normal
  // file picker, which doesn't need the camera permission.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  // The builder autosave/publish payload embeds images (logo, background,
  // dropdown option thumbnails) as base64 data URLs directly in the form's
  // saved schema/theme, which inflates their size by ~33% over the raw
  // file — well past the framework's 1MB default for a Server Action body.
  // A public form submission can also carry several uploads of up to
  // MAX_UPLOAD_BYTES (10 MB) each, so this leaves room for more than one.
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // Admin-uploaded form images, and images proxied for the PDF export:
      // only ever images, never pages, so no script at all — this must
      // come last, because the page policy above (which allows inline
      // script) would otherwise replace it. An old SVG with script inside,
      // opened directly in a tab, stays inert.
      ...["/api/forms/:formId/schema-assets/:path*", "/api/pdf-image-proxy"].map((source) => ({
        source,
        headers: [
          { key: "Content-Security-Policy", value: IMAGE_ONLY_POLICY },
        ],
      })),
    ];
  },
};

export default nextConfig;
