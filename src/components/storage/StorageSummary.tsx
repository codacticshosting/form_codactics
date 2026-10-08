import { CircleAlert, HardDrive } from "lucide-react";
import type { AdminStorageSummary, FormStorageRow } from "@/lib/storage-quota";
import {
  estimateResponseCount,
  formatBytes,
  RESPONSE_SIZE_PROFILES,
  STORAGE_CRITICAL_RATIO,
  STORAGE_WARN_RATIO,
} from "@/lib/storage-limits";
import { UsageBar } from "@/components/storage/UsageBar";
import { RequestStorageButton } from "@/components/storage/RequestStorageButton";

// A form's own average only says something once it has a few responses.
const MIN_RESPONSES_FOR_AVERAGE = 10;

const formBytes = (form: FormStorageRow) => form.formBytes + form.responseBytes;

function Warning({ tone, children }: { tone: "amber" | "red"; children: React.ReactNode }) {
  return (
    <p
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
        tone === "red"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      <CircleAlert size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

// The admin's own storage, on Manage forms: used / free / total, which
// forms use it, and roughly how many more responses fit.
export function StorageSummary({ summary }: { summary: AdminStorageSummary }) {
  const { usedBytes, quotaBytes, freeBytes, isFull } = summary;
  const ratio = quotaBytes ? usedBytes / quotaBytes : 0;

  const isLive = (f: FormStorageRow) => f.status !== "draft" && f.status !== "binned";
  const localForms = summary.forms.filter((f) => isLive(f) && f.storageProvider === "local");
  const drafts = summary.forms.filter((f) => f.status === "draft");
  const googleForms = summary.forms.filter((f) => isLive(f) && f.storageProvider !== "local");
  const binnedForms = summary.forms.filter((f) => f.status === "binned");
  const sum = (forms: FormStorageRow[]) => forms.reduce((total, f) => total + formBytes(f), 0);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-royal-100 bg-white p-4">
      <div className="flex items-center gap-2">
        <HardDrive size={16} className="text-royal-500" />
        <h2 className="text-sm font-semibold text-royal-950">Your storage</h2>
      </div>

      {quotaBytes === null ? (
        <p className="text-sm text-royal-700">
          <span className="font-semibold text-royal-950">{formatBytes(usedBytes)}</span> used ·
          Unlimited storage
        </p>
      ) : (
        <>
          <UsageBar usedBytes={usedBytes} totalBytes={quotaBytes} />
          <p className="text-sm text-royal-700">
            <span className="font-semibold text-royal-950">{formatBytes(usedBytes)}</span> of{" "}
            {formatBytes(quotaBytes)} used ({Math.min(100, Math.round(ratio * 100))}%)
          </p>
          <p className="text-xs text-royal-500">
            Used {formatBytes(usedBytes)} · Free {formatBytes(freeBytes ?? 0)} · Total{" "}
            {formatBytes(quotaBytes)}
          </p>
        </>
      )}

      {isFull ? (
        <Warning tone="red">
          Your storage is full. Your forms that store responses on our server aren&apos;t accepting
          responses right now. Delete or export old responses, use Google Drive storage for new
          forms, or contact <RequestStorageButton /> for more space.
        </Warning>
      ) : ratio >= STORAGE_CRITICAL_RATIO ? (
        <Warning tone="red">
          Your storage is almost full. Delete or export old responses, or contact <RequestStorageButton />{" "}
          for more space, before your forms stop accepting responses.
        </Warning>
      ) : ratio >= STORAGE_WARN_RATIO ? (
        <Warning tone="amber">
          You&apos;ve used over 80% of your storage. Consider deleting or exporting old responses.
        </Warning>
      ) : null}

      {summary.forms.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-royal-100 pt-3 text-sm">
          {localForms.map((form) => {
            const average =
              form.responseCount >= MIN_RESPONSES_FOR_AVERAGE
                ? form.responseBytes / form.responseCount
                : null;
            return (
              <div key={form.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 truncate text-royal-800">{form.title}</span>
                <span className="text-xs text-royal-500">
                  {formatBytes(formBytes(form))} · {form.responseCount} response
                  {form.responseCount === 1 ? "" : "s"}
                  {average !== null && freeBytes !== null && (
                    <>
                      {" "}
                      · ~{formatBytes(average)} each, about{" "}
                      {Math.floor(freeBytes / average).toLocaleString("en-US")} more fit
                    </>
                  )}
                </span>
              </div>
            );
          })}
          {drafts.length > 0 && (
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-royal-800">
                Drafts ({drafts.length}) — including images added in the builder
              </span>
              <span className="text-xs text-royal-500">{formatBytes(sum(drafts))}</span>
            </div>
          )}
          {binnedForms.length > 0 && (
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-royal-800">
                Bin ({binnedForms.length}) — freed when deleted for good
              </span>
              <span className="text-xs text-royal-500">{formatBytes(sum(binnedForms))}</span>
            </div>
          )}
          {googleForms.length > 0 && (
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-royal-800">
                Google Drive forms ({googleForms.length}) — responses are in your own Drive and
                don&apos;t count
              </span>
              <span className="text-xs text-royal-500">{formatBytes(sum(googleForms))}</span>
            </div>
          )}
        </div>
      )}

      {quotaBytes !== null && (
        <p className="text-xs text-royal-500">
          Need more storage? Please contact us via <RequestStorageButton />.
        </p>
      )}

      {freeBytes !== null && (
        <details className="border-t border-royal-100 pt-3 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-royal-600 hover:underline">
            How far does my free space go?
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-royal-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">Form type</th>
                  <th className="py-1 pr-3 font-medium">Approx. per response</th>
                  <th className="py-1 font-medium">With your {formatBytes(freeBytes)} free</th>
                </tr>
              </thead>
              <tbody className="text-royal-800">
                {RESPONSE_SIZE_PROFILES.map((profile) => (
                  <tr key={profile.label} className="border-t border-royal-50">
                    <td className="py-1 pr-3">{profile.label}</td>
                    <td className="py-1 pr-3">
                      {formatBytes(profile.minBytes)} – {formatBytes(profile.maxBytes)}
                    </td>
                    <td className="py-1">
                      {estimateResponseCount(freeBytes, profile.minBytes, profile.maxBytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-royal-400">
            Estimates only — actual sizes depend on what people upload. Forms with lots of photos or
            documents can use Google Drive storage instead, which doesn&apos;t use this space.
          </p>
        </details>
      )}
    </section>
  );
}
