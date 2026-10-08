import Image from "next/image";
import Link from "next/link";
import {
  LayoutTemplate,
  ListChecks,
  ShieldCheck,
  Workflow,
  Palette,
  FileSpreadsheet,
  type LucideIcon,
} from "lucide-react";
import { auth } from "@/auth";
import { UserMenu } from "@/components/UserMenu";
import { CreateFormButton } from "@/components/forms/CreateFormButton";
import { ScrollReveal } from "@/components/home/ScrollReveal";
import { FlipCard } from "@/components/home/FlipCard";
import { WhyCodactis } from "@/components/home/WhyCodactis";
import { ComparisonTable } from "@/components/home/ComparisonTable";
import { UpcomingFeatures } from "@/components/home/UpcomingFeatures";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site-config";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  details: string;
}

const FEATURES: Feature[] = [
  {
    icon: LayoutTemplate,
    title: "Drag-and-drop builder",
    description: "Add fields, reorder them, and customize labels in a visual builder — no coding needed.",
    details: "Click \"Add a field\" to drop in any of 20+ field types, drag to reorder them on the canvas, and preview exactly what respondents will see before you publish — no code, no page refresh.",
  },
  {
    icon: ListChecks,
    title: "20+ field types",
    description: "Short and long text, dropdowns, checklists, ratings, e-signatures, drawing boards, rankings, and file or photo uploads.",
    details: "From a simple short answer or dropdown to a hand-drawn sketch, a drag-to-rank list, or a photo collage board respondents design right on top of your own template image.",
  },
  {
    icon: ShieldCheck,
    title: "Access control",
    description: "Gate a form behind a username and password, with per-user login limits you can reset or raise at any time.",
    details: "Require a username and password to open the form, cap how many times each credential can be used, and reset or raise that limit anytime without touching the form itself.",
  },
  {
    icon: Workflow,
    title: "Multi-step forms",
    description: "Split a long form into sections respondents move through with Next and Back, with per-section visibility rules.",
    details: "Break a long form into sections with their own Next/Back navigation, and optionally show a section only to specific logged-in usernames — great for forms with different tracks or roles.",
  },
  {
    icon: Palette,
    title: "Custom branding",
    description: "Match your event with custom colors, a header image, and a page background for every form you publish.",
    details: "Set your own colors, upload a header image or logo, and choose a page background — every published form can look like part of your event, not a generic form.",
  },
  {
    icon: FileSpreadsheet,
    title: "Your choice of storage",
    description: "Pick Google Sheets in your own Drive, or keep responses local on our server — you choose per form.",
    details: "At publish time, choose where responses go: a spreadsheet + Drive folder in your own Google account, or kept entirely on this server with nothing passing through Google. Either way, download any submission as a PDF.",
  },
];

// Helps search engines show a richer listing (e.g. a software/app result)
// rather than a plain blue link — doesn't affect what's rendered visually.
const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Any (web-based)",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default async function Home() {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  return (
    <div className="flex flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <header className="border-b border-royal-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-3">
          <a
            href="https://www.codactics.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:underline"
          >
            <Image
              src="/logo/codactics.png"
              alt="Team Codactics logo"
              width={20}
              height={20}
              className="rounded"
            />
            CODACTICS
          </a>
          <div className="flex-1" />
          {isLoggedIn ? (
            <UserMenu />
          ) : (
            <Link
              href="/login"
              className="rounded-full border border-royal-200 px-4 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50"
            >
              Login
            </Link>
          )}
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24">
        <Image
          src="/logo/codactics.gif"
          alt="Codactics Form logo"
          width={96}
          height={96}
          unoptimized
          priority
          className="rounded-2xl"
        />

        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-royal-950 sm:text-4xl">
            Codactics Form Builder
          </h1>
          <p className="whitespace-nowrap text-sm font-bold text-royal-600">
            Build and publish any forms in minutes and with few clicks.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <CreateFormButton className="inline-flex h-14 items-center justify-center rounded-full bg-royal-600 px-8 text-base font-medium text-white shadow-lg shadow-royal-600/30 transition-colors hover:bg-royal-700 disabled:cursor-not-allowed disabled:opacity-60">
              Create a new form
            </CreateFormButton>
          ) : (
            <Link
              href="/admin/new"
              className="inline-flex h-14 items-center justify-center rounded-full bg-royal-600 px-8 text-base font-medium text-white shadow-lg shadow-royal-600/30 transition-colors hover:bg-royal-700"
            >
              Create a new form
            </Link>
          )}
          {isLoggedIn && (
            <Link
              href="/admin/forms"
              className="inline-flex h-14 items-center justify-center rounded-full border border-royal-200 bg-white px-8 text-base font-medium text-royal-700 transition-colors hover:bg-royal-50"
            >
              Manage forms
            </Link>
          )}
        </div>

        <p className="max-w-2xl text-center text-sm leading-relaxed text-royal-500">
          Codactics Form is a free online form builder for tournament and
          event registration, developed by Team Codactics. Create a form in
          minutes, gate it behind an access code if you need to, collect
          responses with file uploads and e-signatures, and store them
          wherever you choose — a spreadsheet in your own Google Drive, or
          kept locally on our server — all without writing any code.
        </p>
      </div>

      <section className="border-t border-royal-100 bg-royal-50/40 px-6 py-16">
        <div className="mx-auto flex max-w-5xl flex-col gap-10">
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-royal-950">
              Everything you need to run a registration form
            </h2>
            <p className="max-w-xl text-sm text-royal-500">
              From a simple sign-up sheet to a fully branded, multi-step
              tournament registration — Codactics Form scales with what you need.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <ScrollReveal key={feature.title} delay={i * 80} className="h-full">
                  <FlipCard
                    icon={<Icon size={20} />}
                    title={feature.title}
                    description={feature.description}
                    details={feature.details}
                  />
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto flex max-w-5xl flex-col gap-14">
          <WhyCodactis />
          <ComparisonTable />
        </div>
      </section>

      <section className="border-t border-royal-100 bg-royal-50/40 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <UpcomingFeatures />
        </div>
      </section>
    </div>
  );
}
