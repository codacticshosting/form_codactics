"use client";

import { useState, useTransition } from "react";
import { Plus, X, RotateCcw } from "lucide-react";
import { saveAccessCodes, resetAccessCodeLogins, type AccessCodeSummary } from "@/lib/form-actions";
import { openContactWidget } from "@/lib/contact-widget";

interface CodeRow {
  id?: string; // undefined until saved — the reset button needs a real id
  username: string;
  password: string; // blank on an existing row means "keep the current password"
  isNew: boolean;
  maxLogins: number | null;
  loginCount: number;
}

export function AccessCodeSettings({
  formId,
  initialRequireAccessCode,
  initialAccessCodes,
  loginLimitFeatureEnabled,
  onNeedSignIn,
}: {
  formId?: string | null;
  initialRequireAccessCode: boolean;
  initialAccessCodes: AccessCodeSummary[];
  // Granted per admin from the super-admin control panel — when false, the
  // per-username login limit/usage/reset controls don't render at all
  // (access codes still work, just without that extra control).
  loginLimitFeatureEnabled: boolean;
  // A brand-new form being built anonymously (not signed in yet) has no
  // formId until it's actually published — access codes need a real form
  // row to attach to, so this lets the admin sign in (and get a draft row
  // created) right now instead of hitting a dead end.
  onNeedSignIn?: () => void;
}) {
  const [enabled, setEnabled] = useState(initialRequireAccessCode);
  const [rows, setRows] = useState<CodeRow[]>(
    initialAccessCodes.map((c) => ({
      id: c.id,
      username: c.username,
      password: "",
      isNew: false,
      maxLogins: c.maxLogins,
      loginCount: c.loginCount,
    })),
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [isResetting, startResetting] = useTransition();
  const [resetTarget, setResetTarget] = useState<string | null>(null);

  function addRow() {
    setRows((prev) => [
      ...prev,
      { username: "", password: "", isNew: true, maxLogins: null, loginCount: 0 },
    ]);
  }

  function updateRow(i: number, updates: Partial<CodeRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...updates } : r)));
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleReset(i: number) {
    const row = rows[i];
    if (!row.id) return;
    setResetTarget(row.id);
    startResetting(async () => {
      const result = await resetAccessCodeLogins(row.id!);
      if (result.ok) updateRow(i, { loginCount: 0 });
      setResetTarget(null);
    });
  }

  async function handleSave() {
    if (!formId) return;
    setSaveState("saving");
    setError(null);
    const result = await saveAccessCodes(
      formId,
      enabled,
      rows.map((r) => ({
        username: r.username,
        password: r.password || undefined,
        maxLogins: r.maxLogins,
      })),
    );
    if (result.ok) {
      setSaveState("saved");
      setRows((prev) => prev.map((r) => ({ ...r, password: "", isNew: false })));
      setTimeout(() => setSaveState("idle"), 2000);
    } else {
      setSaveState("error");
      setError(
        {
          "not-signed-in": "You're signed out — please sign in again.",
          "not-found": "Couldn't find this form.",
          "missing-password": "Every new username needs a password.",
          "duplicate-username": "Two entries have the same username.",
        }[result.error],
      );
    }
  }

  return (
    <div className="border-t border-royal-100 pt-4">
      <label className="mb-2 block text-xs font-medium text-royal-700">
        Access control
      </label>
      {!formId ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-xs text-royal-400">
            Sign in to set up access codes — this form isn&apos;t saved
            anywhere yet, so there&apos;s nowhere to attach them until you do.
          </p>
          {onNeedSignIn && (
            <button
              type="button"
              onClick={onNeedSignIn}
              className="rounded-full border border-royal-200 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50"
            >
              Sign in to continue
            </button>
          )}
        </div>
      ) : (
        <>
          <label className="mb-3 flex items-center gap-2 text-sm text-royal-700">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-royal-300"
            />
            Require a username and password to access this form
          </label>

          {enabled && (
            <div className="flex flex-col gap-2">
              {rows.map((row, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-1.5 rounded-lg border border-royal-100 p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <input
                      value={row.username}
                      onChange={(e) => updateRow(i, { username: e.target.value })}
                      placeholder="Username"
                      className="min-w-0 flex-1 rounded-md border border-royal-200 px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
                    />
                    <input
                      value={row.password}
                      onChange={(e) => updateRow(i, { password: e.target.value })}
                      placeholder={
                        row.isNew ? "Password" : "New password (leave blank to keep)"
                      }
                      className="min-w-0 flex-1 rounded-md border border-royal-200 px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="shrink-0 rounded p-1.5 text-royal-300 hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {loginLimitFeatureEnabled && (
                    <div className="flex flex-wrap items-center gap-3 text-xs text-royal-500">
                      <label className="flex items-center gap-1.5">
                        Login limit
                        <input
                          type="number"
                          min={0}
                          value={row.maxLogins ?? ""}
                          onChange={(e) =>
                            updateRow(i, {
                              maxLogins: e.target.value
                                ? Math.max(0, Number(e.target.value))
                                : null,
                            })
                          }
                          placeholder="Unlimited"
                          className="w-20 rounded-md border border-royal-200 bg-white px-2 py-1 text-xs text-royal-950 focus:border-royal-500 focus:outline-none"
                        />
                      </label>
                      {!row.isNew && row.id && (
                        <>
                          <span>Used {row.loginCount} time{row.loginCount === 1 ? "" : "s"}</span>
                          <button
                            type="button"
                            onClick={() => handleReset(i)}
                            disabled={isResetting && resetTarget === row.id}
                            className="flex items-center gap-1 font-medium text-royal-600 hover:underline disabled:opacity-60"
                          >
                            <RotateCcw size={11} />
                            {isResetting && resetTarget === row.id
                              ? "Resetting…"
                              : "Reset usage"}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-1.5 self-start rounded-md border border-dashed border-royal-300 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50"
              >
                <Plus size={14} />
                Add username
              </button>

              {!loginLimitFeatureEnabled && (
                <div className="flex flex-col items-start gap-1.5 rounded-md border border-dashed border-royal-200 bg-royal-50/60 px-3 py-2">
                  <p className="text-xs text-royal-500">
                    ✨ Upcoming feature: user login restrictions — cap how
                    many times each username/password can be used, and
                    reset or raise it anytime. It&apos;s enabled per account.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      openContactWidget(
                        "Hi! I'd like the login-limit feature enabled for my account.",
                      )
                    }
                    className="text-xs font-medium text-royal-600 hover:underline"
                  >
                    Request access →
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saveState === "saving"}
              className="rounded-full bg-royal-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-royal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveState === "saving" ? "Saving…" : "Save access settings"}
            </button>
            {saveState === "saved" && (
              <span className="text-xs font-medium text-green-600">Saved</span>
            )}
            {saveState === "error" && error && (
              <span className="text-xs font-medium text-red-600">{error}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
