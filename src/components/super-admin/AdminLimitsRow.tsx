"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAdminLimits, setLoginLimitFeature } from "@/lib/super-admin-actions";
import { MAX_DRAFTS_PER_ADMIN, MAX_PUBLISHED_PER_ADMIN } from "@/lib/form-limits";

export function AdminLimitsRow({
  adminId,
  email,
  name,
  joined,
  draftCount,
  publishedCount,
  maxDrafts,
  maxPublished,
  loginLimitFeatureEnabled,
}: {
  adminId: string;
  email: string;
  name: string | null;
  joined: string;
  draftCount: number;
  publishedCount: number;
  maxDrafts: number | null;
  maxPublished: number | null;
  loginLimitFeatureEnabled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isTogglingFeature, startTogglingFeature] = useTransition();
  const [draftsInput, setDraftsInput] = useState(maxDrafts?.toString() ?? "");
  const [publishedInput, setPublishedInput] = useState(maxPublished?.toString() ?? "");
  const [featureEnabled, setFeatureEnabled] = useState(loginLimitFeatureEnabled);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    startTransition(async () => {
      await setAdminLimits(adminId, {
        maxDrafts: draftsInput.trim() ? Math.max(0, Number(draftsInput)) : null,
        maxPublished: publishedInput.trim() ? Math.max(0, Number(publishedInput)) : null,
      });
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    });
  }

  function handleToggleFeature(enabled: boolean) {
    setFeatureEnabled(enabled);
    startTogglingFeature(async () => {
      await setLoginLimitFeature(adminId, enabled);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-royal-100 bg-white p-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-royal-950">
          {name || email}
        </p>
        <p className="truncate text-xs text-royal-400">
          {email} · joined {joined}
        </p>
      </div>

      <label className="flex items-center gap-1.5 text-xs font-medium text-royal-600">
        Drafts ({draftCount})
        <input
          type="number"
          min={0}
          value={draftsInput}
          onChange={(e) => setDraftsInput(e.target.value)}
          placeholder={String(MAX_DRAFTS_PER_ADMIN)}
          className="w-16 rounded-md border border-royal-200 px-2 py-1 text-xs text-royal-950 focus:border-royal-500 focus:outline-none"
        />
      </label>

      <label className="flex items-center gap-1.5 text-xs font-medium text-royal-600">
        Published ({publishedCount})
        <input
          type="number"
          min={0}
          value={publishedInput}
          onChange={(e) => setPublishedInput(e.target.value)}
          placeholder={String(MAX_PUBLISHED_PER_ADMIN)}
          className="w-16 rounded-md border border-royal-200 px-2 py-1 text-xs text-royal-950 focus:border-royal-500 focus:outline-none"
        />
      </label>

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="shrink-0 rounded-full bg-royal-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-royal-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
      {saved && (
        <span className="shrink-0 text-xs font-medium text-green-600">Saved</span>
      )}

      <label className="flex shrink-0 items-center gap-1.5 border-l border-royal-100 pl-4 text-xs font-medium text-royal-600">
        <input
          type="checkbox"
          checked={featureEnabled}
          disabled={isTogglingFeature}
          onChange={(e) => handleToggleFeature(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-royal-300"
        />
        Access-code login limits
      </label>
    </div>
  );
}
