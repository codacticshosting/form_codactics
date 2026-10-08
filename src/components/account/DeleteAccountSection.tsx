"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { requestAccountDeletion } from "@/lib/account-actions";
import { ACCOUNT_DELETION_DAYS } from "@/lib/form-limits";

export function DeleteAccountSection() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await requestAccountDeletion(confirmation);
      if (!result.ok) {
        setError(
          result.error === "not-confirmed"
            ? "Please type DELETE to confirm."
            : "You're not signed in any more. Please sign in and try again.",
        );
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-red-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <TriangleAlert size={18} className="text-red-600" />
        <h2 className="text-sm font-semibold text-red-700">Delete account</h2>
      </div>
      <div className="flex flex-col gap-2 text-sm text-royal-700">
        <p>
          Codactics Form believes your data belongs to you. When you delete your account:
        </p>
        <ul className="ml-5 list-disc space-y-1 text-royal-600">
          <li>
            Your account is <strong>isolated right away</strong>: all your forms go offline and
            stop accepting responses, and nothing new can be created or published.
          </li>
          <li>
            After <strong>{ACCOUNT_DELETION_DAYS} days</strong>, your account and everything
            stored on our server — every form, draft, response, uploaded file and access code —
            is <strong>deleted for good</strong>. It can&apos;t be accessed or restored after
            that, by you or by us.
          </li>
          <li>
            Changed your mind? Sign in within those {ACCOUNT_DELETION_DAYS} days and cancel the
            deletion — everything comes back as it was.
          </li>
          <li>
            If you sign in again after that, you start with a brand-new, empty account.
          </li>
          <li>
            Spreadsheets and files in your own Google Drive stay there — they&apos;re yours,
            and we can&apos;t delete them.
          </li>
        </ul>
        <p className="font-medium text-royal-800">
          Want to keep your responses? Export them (CSV or JSON) from each form&apos;s Responses
          page first.
        </p>
      </div>
      <label className="flex flex-col gap-1.5 text-xs font-medium text-royal-600">
        Type DELETE to confirm
        <input
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          autoComplete="off"
          className="w-48 rounded-md border border-royal-200 px-2.5 py-1.5 text-sm text-royal-950 focus:border-red-400 focus:outline-none"
        />
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending || confirmation.trim() !== "DELETE"}
        className="self-start rounded-full bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Deleting…" : "Delete my account"}
      </button>
    </section>
  );
}
