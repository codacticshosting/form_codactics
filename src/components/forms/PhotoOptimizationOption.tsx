"use client";

import {
  estimateResponseCount,
  formatBytes,
  PHOTO_OPTIMIZED_PROFILE,
  PHOTO_ORIGINAL_PROFILE,
} from "@/lib/storage-limits";
import { PHOTO_MAX_DIMENSION } from "@/lib/compress-photo";

// The "Optimize uploaded photos" checkbox (Form.compressPhotos) with why
// it's worth having — shown in the publish dialog, the builder's Design
// step and the form's Settings page, all changing the same setting.
export function PhotoOptimizationOption({
  checked,
  onChange,
  storage,
  freeBytes,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  // Where this form's responses go, if known — tailors the first benefit.
  storage?: "local" | "google";
  // The admin's free space, for the on/off comparison (local storage only).
  freeBytes?: number | null;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-royal-200 p-3 text-left">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-royal-300"
      />
      <span className="flex flex-col gap-1 text-xs text-royal-600">
        <span className="text-sm font-semibold text-royal-950">
          Optimize uploaded photos <span className="font-normal text-royal-500">(recommended)</span>
        </span>
        <span>
          Photos are resized in the visitor&apos;s browser before upload (max {PHOTO_MAX_DIMENSION}{" "}
          px).
        </span>
        <span className="flex flex-col gap-0.5 text-royal-700">
          <span>
            ✓{" "}
            {storage === "google"
              ? "Saves space in your Google Drive"
              : "About 10× more responses fit in your storage"}{" "}
            (≈ 300 KB instead of 3–5 MB per photo)
          </span>
          <span>✓ Much faster uploads on mobile data</span>
          <span>✓ Fewer failed submissions on slow connections</span>
          <span>✓ Removes hidden photo data like GPS location (privacy)</span>
        </span>
        <span className="text-royal-500">
          Turn off only if you need original quality — e.g. for printing, or documents where small
          details matter.
        </span>
        {storage !== "google" && freeBytes != null && freeBytes > 0 && (
          <span className="font-medium text-royal-700">
            With your {formatBytes(freeBytes)} free:{" "}
            {estimateResponseCount(
              freeBytes,
              PHOTO_OPTIMIZED_PROFILE.minBytes,
              PHOTO_OPTIMIZED_PROFILE.maxBytes,
            )}{" "}
            photo responses (on) ·{" "}
            {estimateResponseCount(
              freeBytes,
              PHOTO_ORIGINAL_PROFILE.minBytes,
              PHOTO_ORIGINAL_PROFILE.maxBytes,
            )}{" "}
            (off)
          </span>
        )}
      </span>
    </label>
  );
}
