"use client";

import { openContactWidget } from "@/lib/contact-widget";

// Opens the Codactics Support widget with a storage request already
// written, so it arrives in the super-admin inbox marked as a request.
export function RequestStorageButton() {
  return (
    <button
      type="button"
      onClick={() =>
        openContactWidget("Hi! I'd like more storage for my account. Here's what I need it for: ")
      }
      className="font-medium text-royal-600 hover:underline"
    >
      Codactics Support
    </button>
  );
}
