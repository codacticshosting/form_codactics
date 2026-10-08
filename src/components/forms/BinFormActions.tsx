"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { deleteFormPermanently, restoreFormFromBin } from "@/lib/form-actions";

// Restore / Delete permanently for one form in the Bin.
export function BinFormActions({ formId, formTitle }: { formId: string; formTitle: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRestore() {
    setError(null);
    startTransition(async () => {
      const result = await restoreFormFromBin(formId);
      if (!result.ok) {
        setError(
          result.error === "draft-limit"
            ? "You've reached your drafts limit — delete or publish a draft first."
            : "Couldn't restore this form. Please reload and try again.",
        );
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    const confirmed = window.confirm(
      `Permanently delete "${formTitle}"?\n\nThe form, all its responses and uploaded files are deleted for good. This can't be undone.`,
    );
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteFormPermanently(formId);
      if (!result.ok) setError("Couldn't delete this form. Please reload and try again.");
      router.refresh();
    });
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleRestore}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-full border border-royal-200 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50 disabled:cursor-wait disabled:opacity-60"
        >
          <RotateCcw size={12} />
          Restore
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
        >
          <Trash2 size={12} />
          Delete permanently
        </button>
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
