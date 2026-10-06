"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteForm } from "@/lib/form-actions";

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

  if (confirming) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-royal-500">Delete this form?</span>
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              await deleteForm(formId);
              router.refresh();
            })
          }
          disabled={isPending}
          className="font-medium text-red-600 hover:underline disabled:opacity-60"
        >
          {isPending ? "Deleting…" : "Yes, delete"}
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
      title="Delete"
    >
      <Trash2 size={14} />
    </button>
  );
}
