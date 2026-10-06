"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { duplicateForm } from "@/lib/form-actions";

export function DuplicateFormButton({ formId }: { formId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    const result = await duplicateForm(formId);
    if (result.ok) {
      router.push(`/admin/new?formId=${result.formId}`);
      return;
    }
    setPending(false);
    setError(
      result.error === "draft-limit"
        ? "You've reached your draft limit — delete or publish one first."
        : "Couldn't duplicate this form.",
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-royal-200 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50 disabled:cursor-not-allowed disabled:opacity-60"
        title="Copy this form's fields and design into a new draft"
      >
        <Copy size={12} />
        {pending ? "Duplicating…" : "Duplicate"}
      </button>
      {error && <p className="text-[11px] font-medium text-red-600">{error}</p>}
    </div>
  );
}
