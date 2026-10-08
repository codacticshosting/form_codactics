"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { CalendarX } from "lucide-react";
import { cancelAccountDeletion } from "@/lib/account-actions";

// What an admin sees instead of their account while it's scheduled for
// deletion — the date, and the one way back.
export function AccountDeletionNotice({ deletionDate }: { deletionDate: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelAccountDeletion();
      if (!result.ok) {
        setError("This account can't be restored any more — its deletion period is over.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-white p-8 text-center">
      <CalendarX size={28} className="text-red-500" />
      <h2 className="text-lg font-semibold text-royal-950">
        Your account is scheduled for deletion
      </h2>
      <p className="max-w-md text-sm text-royal-600">
        All your forms are offline and not accepting responses. On{" "}
        <strong>{deletionDate}</strong> your account and everything stored on our server is
        deleted for good and can&apos;t be restored.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="rounded-full bg-royal-600 px-5 py-2 text-sm font-medium text-white hover:bg-royal-700 disabled:cursor-wait disabled:opacity-60"
        >
          {isPending ? "Restoring…" : "Cancel deletion and keep my account"}
        </button>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="rounded-full border border-royal-200 px-5 py-2 text-sm font-medium text-royal-600 hover:bg-royal-50"
        >
          Sign out
        </button>
      </div>
    </section>
  );
}
