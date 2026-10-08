"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteForm } from "@/lib/form-actions";
import { BIN_LIMIT, BIN_RETENTION_DAYS } from "@/lib/form-limits";

// Moves a form to the Bin (see deleteForm) — it isn't deleted for good
// until BIN_RETENTION_DAYS later, or when emptied from the Bin.
export function DeleteFormButton({
  formId,
  formTitle,
}: {
  formId: string;
  formTitle: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (error) {
    return (
      <div className="flex max-w-xs items-center gap-2 text-xs">
        <span className="text-red-600">{error}</span>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirming(false);
          }}
          className="shrink-0 font-medium text-royal-400 hover:underline"
        >
          OK
        </button>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-royal-500" title={`Kept in the Bin for ${BIN_RETENTION_DAYS} days`}>
          Move to Bin?
        </span>
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              const result = await deleteForm(formId);
              if (!result.ok && result.error === "bin-full") {
                setError(
                  `Your Bin is full — it can keep only ${BIN_LIMIT} forms. Please clean your Bin first (restore or permanently delete a form there).`,
                );
                return;
              }
              router.refresh();
            })
          }
          disabled={isPending}
          className="font-medium text-red-600 hover:underline disabled:opacity-60"
        >
          {isPending ? "Moving…" : "Yes, move to Bin"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="font-medium text-royal-400 hover:underline"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1 rounded-md p-1.5 text-royal-400 hover:bg-red-50 hover:text-red-600"
      aria-label={`Delete ${formTitle}`}
      title="Delete (moves to Bin)"
    >
      <Trash2 size={14} />
    </button>
  );
}
