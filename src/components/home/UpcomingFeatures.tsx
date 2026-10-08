"use client";

import { Lock, Gauge, HardDrive, type LucideIcon } from "lucide-react";
import { openContactWidget } from "@/lib/contact-widget";

interface UpcomingFeature {
  icon: LucideIcon;
  title: string;
  description: string;
  prefillMessage: string;
  ctaLabel: string;
}

// Rolled out per account while we see how it's used in practice, rather
// than on by default for everyone — each CTA opens the contact widget
// with a message already filled in asking for it.
const UPCOMING_FEATURES: UpcomingFeature[] = [
  {
    icon: Lock,
    title: "User login restrictions",
    description:
      "Cap how many times each username/password can be used to access your form, then reset or raise the limit anytime.",
    prefillMessage: "Hi! I'd like the login-limit feature enabled for my account.",
    ctaLabel: "Request",
  },
  {
    icon: Gauge,
    title: "Higher draft & publish limits",
    description:
      "Need to work on more drafts, or keep more forms published at once, than the default allows? We can raise your limit on request.",
    prefillMessage: "Hi! I'd like a higher draft/publish limit for my account.",
    ctaLabel: "Request",
  },
  {
    icon: HardDrive,
    title: "More storage on our server",
    description:
      "Every account includes 200 MB for responses and files stored on our server. Need more than 200 MB? Contact us and we'll increase it for you.",
    prefillMessage: "Hi! I'd like more than 200 MB of storage for my account. Here's what I need it for: ",
    ctaLabel: "Contact us",
  },
];

export function UpcomingFeatures() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
          ✨ Upcoming feature
        </span>
        <h2 className="text-2xl font-semibold tracking-tight text-royal-950">
          Already built, rolling out by request
        </h2>
        <p className="max-w-xl text-sm text-royal-500">
          Some features are available per account while we roll them out —
          just let us know you&apos;d like one turned on.
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {UPCOMING_FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.title}
              className="flex flex-col items-start gap-4 rounded-xl border border-royal-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-royal-100 text-royal-600">
                  <Icon size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-royal-950">
                    {feature.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-royal-500">
                    {feature.description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openContactWidget(feature.prefillMessage)}
                className="shrink-0 self-start rounded-full bg-royal-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-royal-700 sm:self-center"
              >
                {feature.ctaLabel}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
