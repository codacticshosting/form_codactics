"use client";

import { useActionState } from "react";
import { Lock, CircleAlert } from "lucide-react";
import { HeaderPreview } from "@/components/design/HeaderPreview";
import { FormRenderer } from "@/components/form/FormRenderer";
import type { FormField } from "@/types/form-builder";
import type { FormTheme } from "@/types/theme";
import type { SubmitState } from "@/types/submission";
import { submitAccessCode } from "./gate-actions";
import { initialGateState } from "./gate-state";

export function AccessGate({
  slug,
  title,
  theme,
  fields,
  submitAction,
  checkUploadFits,
}: {
  slug: string;
  title: string;
  theme: FormTheme;
  fields: FormField[];
  submitAction: (
    prevState: SubmitState,
    formData: FormData,
  ) => Promise<SubmitState>;
  checkUploadFits?: (bytes: number) => Promise<boolean>;
}) {
  const [state, formAction, isPending] = useActionState(
    submitAccessCode.bind(null, slug),
    initialGateState,
  );

  // The unlock only lives in this component's state for the current page
  // load — a refresh re-mounts from scratch with no memory of it, and the
  // signed cookie set alongside it is only for submitAction's own
  // server-side check, never consulted to skip the gate on a page render.
  if (state.status === "success") {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <FormRenderer
          title={title}
          fields={fields}
          theme={theme}
          submitAction={submitAction}
          checkUploadFits={checkUploadFits}
          currentUsername={state.username}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <HeaderPreview theme={theme} title={title} />
      <form
        action={formAction}
        className="flex flex-col gap-3 rounded-2xl border border-royal-100 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col items-center gap-2 pb-1 text-center">
          <Lock size={24} className="text-royal-400" />
          <h2 className="text-lg font-semibold text-royal-950">
            This form requires a username and password
          </h2>
          <p className="text-sm text-royal-500">
            Ask the organizer if you don&apos;t have one.
          </p>
        </div>

        {state.status === "error" && state.message && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <CircleAlert size={16} className="shrink-0" />
            {state.message}
          </div>
        )}

        <input
          name="username"
          placeholder="Username"
          autoComplete="username"
          required
          className="w-full rounded-md border border-royal-200 px-3 py-2 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          required
          className="w-full rounded-md border border-royal-200 px-3 py-2 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isPending}
          className="mt-1 rounded-full bg-royal-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-royal-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Checking…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
