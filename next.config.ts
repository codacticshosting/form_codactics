import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
