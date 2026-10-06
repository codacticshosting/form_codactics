"use client";

import { useState, type ReactNode } from "react";

export function FlipCard({
  icon,
  title,
  description,
  details,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  details: string;
}) {
  const [flipped, setFlipped] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      aria-pressed={flipped}
      aria-label={`${title} — click to ${flipped ? "show less" : "show more"}`}
      className="group block h-full min-h-[220px] w-full text-left [perspective:1200px]"
    >
      <div
        className="relative h-full w-full transition-transform duration-500 ease-out [transform-style:preserve-3d]"
        style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        {/* Front */}
        <div className="absolute inset-0 flex h-full flex-col gap-3 rounded-xl border border-royal-100 bg-white p-5 shadow-sm [backface-visibility:hidden]">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-royal-100 text-royal-600">
            {icon}
          </div>
          <h3 className="text-sm font-semibold text-royal-950">{title}</h3>
          <p className="text-sm leading-relaxed text-royal-500">{description}</p>
          <span className="mt-auto text-[11px] font-medium text-royal-400 transition-colors group-hover:text-royal-600">
            Click to learn more →
          </span>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 flex h-full flex-col gap-3 rounded-xl border border-royal-600 bg-royal-600 p-5 text-white shadow-sm [backface-visibility:hidden]"
          style={{ transform: "rotateY(180deg)" }}
        >
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-sm leading-relaxed text-royal-50">{details}</p>
          <span className="mt-auto text-[11px] font-medium text-royal-200">
            ← Click to flip back
          </span>
        </div>
      </div>
    </button>
  );
}
