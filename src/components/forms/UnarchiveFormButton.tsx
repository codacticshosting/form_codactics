"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore } from "lucide-react";
import { unarchiveForm } from "@/lib/form-actions";

export function UnarchiveFormButton({ formId }: { formId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await unarchiveForm(formId);
            if (result.ok) {
              router.refresh();
            } else if (result.error === "publish-limit") {
              setError("You're already at your published-forms limit — archive or delete one first.");
            } else {
              setError("Couldn't restore this form.");
            }
          })
        }
        disabled={isPending}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-royal-200 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50 disabled:cursor-not-allowed disabled:opacity-60"
        title="Bring this form back to Published, same URL as before"
      >
        <ArchiveRestore size={12} />
        {isPending ? "Restoring…" : "Unarchive"}
      </button>
      {error && <span className="text-[11px] font-medium text-red-600">{error}</span>}
    </div>
  );
}
