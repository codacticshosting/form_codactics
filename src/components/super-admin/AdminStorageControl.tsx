"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAdminStorageQuota, type AdminStorageQuota } from "@/lib/super-admin-actions";
import { formatBytes, formatMB, QUOTA_PRESETS_MB } from "@/lib/storage-limits";
import { UsageBar, usageTextColor } from "@/components/storage/UsageBar";

// The select's value: "default", "unlimited", "custom", or a preset's MB.
function initialChoice(storageQuotaMB: number | null, storageUnlimited: boolean): string {
  if (storageUnlimited) return "unlimited";
  if (storageQuotaMB === null) return "default";
  return QUOTA_PRESETS_MB.includes(storageQuotaMB) ? String(storageQuotaMB) : "custom";
}

export function AdminStorageControl({
  adminId,
  usedBytes,
  quotaBytes,
  storageQuotaMB,
  storageUnlimited,
  defaultQuotaMB,
}: {
  adminId: string;
  usedBytes: number;
  quotaBytes: number | null;
  storageQuotaMB: number | null;
  storageUnlimited: boolean;
  defaultQuotaMB: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [choice, setChoice] = useState(initialChoice(storageQuotaMB, storageUnlimited));
  const [customMB, setCustomMB] = useState(storageQuotaMB?.toString() ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function handleSave() {
    let quota: AdminStorageQuota;
    if (choice === "default") quota = { mode: "default" };
    else if (choice === "unlimited") quota = { mode: "unlimited" };
    else quota = { mode: "custom", quotaMB: Number(choice === "custom" ? customMB : choice) };

    setMessage(null);
    startTransition(async () => {
      const result = await setAdminStorageQuota(adminId, quota);
      setMessage(
        result.ok
          ? { ok: true, text: "Saved" }
          : { ok: false, text: result.error === "invalid" ? "Enter a whole number of MB" : "Not saved" },
      );
      if (result.ok) {
        router.refresh();
        setTimeout(() => setMessage(null), 2000);
      }
    });
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-3 border-t border-royal-100 pt-3">
      <div className="flex min-w-[180px] flex-1 flex-col gap-1">
        <UsageBar usedBytes={usedBytes} totalBytes={quotaBytes} size="sm" />
        <span className={`text-xs ${usageTextColor(usedBytes, quotaBytes)}`}>
          {formatBytes(usedBytes)} of {quotaBytes === null ? "Unlimited" : formatBytes(quotaBytes)}{" "}
          used
        </span>
      </div>
      <label className="flex items-center gap-1.5 text-xs font-medium text-royal-600">
        Storage
        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="rounded-md border border-royal-200 px-2 py-1 text-xs text-royal-950 focus:border-royal-500 focus:outline-none"
        >
          <option value="default">Default ({formatMB(defaultQuotaMB)})</option>
          {QUOTA_PRESETS_MB.map((mb) => (
            <option key={mb} value={String(mb)}>
              {formatMB(mb)}
            </option>
          ))}
          <option value="custom">Custom…</option>
          <option value="unlimited">Unlimited</option>
        </select>
      </label>
      {choice === "custom" && (
        <label className="flex items-center gap-1 text-xs text-royal-600">
          <input
            type="number"
            min={1}
            value={customMB}
            onChange={(e) => setCustomMB(e.target.value)}
            className="w-20 rounded-md border border-royal-200 px-2 py-1 text-xs text-royal-950 focus:border-royal-500 focus:outline-none"
          />
          MB
        </label>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="shrink-0 rounded-full border border-royal-200 px-3 py-1 text-xs font-medium text-royal-600 hover:bg-royal-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Set storage"}
      </button>
      {message && (
        <span className={`text-xs font-medium ${message.ok ? "text-green-600" : "text-red-600"}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}
