"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createDraft } from "@/lib/form-actions";

export function CreateFormButton({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    const result = await createDraft();
    if (result.ok) {
      router.push(`/admin/new?formId=${result.formId}`);
      return;
    }
    setPending(false);
    if (result.error === "draft-limit") {
      setError("You've reached your draft limit — delete or publish one first.");
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={className}
      >
        {pending ? "Creating…" : children}
      </button>
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
