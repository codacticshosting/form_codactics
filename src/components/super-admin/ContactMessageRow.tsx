"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateContactMessage,
  type ContactMessageAction,
} from "@/lib/contact-actions";
import type { ContactMessageStatus } from "@/lib/contact-messages";

// Which buttons each status offers — the inbox tab gets read/unread,
// archive and delete; Archived and Trash only offer a way back (plus
// moving an archived message on to Trash).
const ACTIONS: Record<ContactMessageStatus, { action: ContactMessageAction; label: string }[]> = {
  new: [
    { action: "read", label: "Mark read" },
    { action: "archive", label: "Archive" },
    { action: "delete", label: "Delete" },
  ],
  read: [
    { action: "unread", label: "Mark unread" },
    { action: "archive", label: "Archive" },
    { action: "delete", label: "Delete" },
  ],
  archived: [
    { action: "restore", label: "Restore" },
    { action: "delete", label: "Delete" },
  ],
  deleted: [{ action: "restore", label: "Restore" }],
};

export function ContactMessageRow({
  id,
  name,
  email,
  message,
  status,
  isFeatureRequest,
  isSignedInUser,
  received,
  expires,
}: {
  id: string;
  name: string | null;
  email: string;
  message: string;
  status: ContactMessageStatus;
  isFeatureRequest: boolean;
  isSignedInUser: boolean;
  received: string;
  expires: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isNew = status === "new";

  function handleAction(action: ContactMessageAction) {
    startTransition(async () => {
      await updateContactMessage(id, action);
      router.refresh();
    });
  }

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border bg-white p-4 ${
        isNew ? "border-royal-300 shadow-sm" : "border-royal-100"
      } ${isPending ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-royal-950">
            {isNew && (
              <span className="rounded-full bg-royal-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                New
              </span>
            )}
            <span className="truncate">{name || email}</span>
            {isFeatureRequest && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                Feature request
              </span>
            )}
            {isSignedInUser && (
              <span className="rounded-full bg-royal-50 px-2 py-0.5 text-[10px] font-medium text-royal-600">
                Signed-in user
              </span>
            )}
          </p>
          <p className="truncate text-xs text-royal-400">
            {email} · {received}
          </p>
        </div>
        {expires && (
          <p className="shrink-0 text-xs text-royal-400">Auto-deletes {expires}</p>
        )}
      </div>

      <p className="whitespace-pre-wrap break-words text-sm text-royal-800">{message}</p>

      <div className="flex flex-wrap gap-2">
        {ACTIONS[status].map(({ action, label }) => (
          <button
            key={action}
            type="button"
            onClick={() => handleAction(action)}
            disabled={isPending}
            className={
              action === "delete"
                ? "rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed"
                : "rounded-full border border-royal-200 px-3 py-1 text-xs font-medium text-royal-600 hover:bg-royal-50 disabled:cursor-not-allowed"
            }
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
