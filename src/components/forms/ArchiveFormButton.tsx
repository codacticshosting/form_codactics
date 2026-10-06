"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { archiveForm } from "@/lib/form-actions";

export function ArchiveFormButton({ formId }: { formId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          await archiveForm(formId);
          router.refresh();
        })
      }
      disabled={isPending}
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-royal-200 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50 disabled:cursor-not-allowed disabled:opacity-60"
      title="Retire this form without deleting it — it stops being publicly reachable, and you can bring it back later"
    >
      <Archive size={12} />
      {isPending ? "Archiving…" : "Archive"}
    </button>
  );
}
