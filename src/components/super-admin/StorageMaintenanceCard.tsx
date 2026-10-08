"use client";

import { useState, useTransition } from "react";
import { HardDrive } from "lucide-react";
import { recalculateStorage, type RecalculateStorageActionResult } from "@/lib/super-admin-actions";
import { formatBytes } from "@/lib/storage-limits";

export function StorageMaintenanceCard() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<RecalculateStorageActionResult | null>(null);

  function handleRun() {
    setResult(null);
    startTransition(async () => {
      setResult(await recalculateStorage());
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-royal-100 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <HardDrive size={18} className="shrink-0 text-royal-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-royal-950">Storage maintenance</p>
          <p className="text-xs text-royal-400">
            Re-measures every form and response from the files on disk, and removes leftover
            files that no longer belong to any form or response. Safe to run any time.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRun}
          disabled={isPending}
          className="shrink-0 rounded-full bg-royal-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-royal-700 disabled:cursor-wait disabled:opacity-60"
        >
          {isPending ? "Working…" : "Recalculate & clean up"}
        </button>
      </div>
      {result &&
        (result.ok ? (
          <p className="text-xs text-green-700">
            Done — measured {result.formsMeasured} form{result.formsMeasured === 1 ? "" : "s"} and{" "}
            {result.submissionsMeasured} response{result.submissionsMeasured === 1 ? "" : "s"},
            corrected {result.sizesCorrected} size{result.sizesCorrected === 1 ? "" : "s"}, removed{" "}
            {result.leftoversRemoved} leftover item{result.leftoversRemoved === 1 ? "" : "s"} (
            {formatBytes(result.bytesFreed)} freed).
          </p>
        ) : (
          <p className="text-xs text-red-600">You don&apos;t have permission to do this.</p>
        ))}
    </div>
  );
}
