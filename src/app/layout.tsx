import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { ContactWidget } from "@/components/ContactWidget";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site-config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Build & Publish Forms Online`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "form builder",
    "online form builder",
    "tournament registration form",
    "event registration form",
    "create forms online",
    "Codactics Form",
    "CODACTICS",
  ],
  icons: {
    icon: "/favicon.ico",
    shortcut: "/logo/codactics.ico",
    apple: "/logo/codactics.png",
  },
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Build & Publish Forms Online`,
    description: SITE_DESCRIPTION,
    images: [{ url: "/logo/codactics.png", width: 500, height: 500, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary",
    title: `${SITE_NAME} — Build & Publish Forms Online`,
    description: SITE_DESCRIPTION,
    images: ["/logo/codactics.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <SessionProvider>
          <div className="flex flex-1 flex-col">{children}</div>
          <Footer />
          <ContactWidget />
        </SessionProvider>
      </body>
    </html>
  );
}
