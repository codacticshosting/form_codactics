"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStorageSettings } from "@/lib/super-admin-actions";

const inputClass =
  "w-24 rounded-md border border-royal-200 px-2 py-1 text-xs text-royal-950 focus:border-royal-500 focus:outline-none disabled:bg-royal-50 disabled:text-royal-300";

export function StorageSettingsForm({
  defaultQuotaMB,
  totalLimitMB,
  reserveMB,
}: {
  defaultQuotaMB: number;
  totalLimitMB: number | null;
  reserveMB: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [defaultQuota, setDefaultQuota] = useState(String(defaultQuotaMB));
  const [wholeDisk, setWholeDisk] = useState(totalLimitMB === null);
  const [totalLimit, setTotalLimit] = useState(totalLimitMB?.toString() ?? "");
  const [reserve, setReserve] = useState(String(reserveMB));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const result = await setStorageSettings({
        defaultQuotaMB: Number(defaultQuota),
        totalLimitMB: wholeDisk ? null : Number(totalLimit),
        reserveMB: Number(reserve),
      });
      setMessage(
        result.ok
          ? { ok: true, text: "Saved" }
          : {
              ok: false,
              text:
                result.error === "invalid"
                  ? "Please enter whole numbers (default quota and total limit at least 1 MB)."
                  : "You don't have permission to do this.",
            },
      );
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-royal-100 bg-white p-4">
      <p className="text-sm font-medium text-royal-950">Storage settings</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-medium text-royal-600">
        <label className="flex items-center gap-1.5">
          Default quota per admin
          <input
            type="number"
            min={1}
            value={defaultQuota}
            onChange={(e) => setDefaultQuota(e.target.value)}
            className={inputClass}
          />
          MB
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          Total limit for all admins
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={wholeDisk}
              onChange={(e) => setWholeDisk(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-royal-300"
            />
            Whole disk
          </label>
          <input
            type="number"
            min={1}
            value={totalLimit}
            onChange={(e) => setTotalLimit(e.target.value)}
            disabled={wholeDisk}
            placeholder="e.g. 4096"
            className={inputClass}
          />
          MB
        </div>
        <label className="flex items-center gap-1.5">
          Always keep free (reserve)
          <input
            type="number"
            min={0}
            value={reserve}
            onChange={(e) => setReserve(e.target.value)}
            className={inputClass}
          />
          MB
        </label>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-full bg-royal-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-royal-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        {message && (
          <span className={message.ok ? "text-green-600" : "text-red-600"}>{message.text}</span>
        )}
      </div>
      <p className="text-xs text-royal-400">
        Changing the default applies at once to every admin without their own quota. Lowering any
        limit never deletes data — it only stops new uploads and responses once it&apos;s reached.
        To get more disk space, enlarge the volume in Railway; it shows up here automatically.
      </p>
    </div>
  );
}
