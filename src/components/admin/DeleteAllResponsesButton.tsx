"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteAllResponses } from "@/lib/response-actions";

export function DeleteAllResponsesButton({
  formId,
  responseCount,
}: {
  formId: string;
  responseCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    const confirmed = window.confirm(
      `Delete all ${responseCount} response${responseCount === 1 ? "" : "s"} and their uploaded files?\n\n` +
        "This can't be undone. If you want to keep a copy, cancel and use Export CSV or Export JSON first.",
    );
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteAllResponses(formId);
      if (!result.ok) window.alert("Couldn't delete the responses. Please reload and try again.");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
    >
      <Trash2 size={12} />
      {isPending ? "Deleting…" : "Delete all responses"}
    </button>
  );
}
