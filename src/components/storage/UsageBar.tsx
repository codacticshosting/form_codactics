import { STORAGE_CRITICAL_RATIO, STORAGE_WARN_RATIO } from "@/lib/storage-limits";

// A plain used-of-total bar: royal normally, amber from 80%, red from 95%.
// `totalBytes` null (unlimited) draws an empty track — there's no
// fraction to show.
export function UsageBar({
  usedBytes,
  totalBytes,
  size = "md",
}: {
  usedBytes: number;
  totalBytes: number | null;
  size?: "sm" | "md";
}) {
  const ratio = totalBytes ? Math.min(1, usedBytes / totalBytes) : 0;
  const color =
    ratio >= STORAGE_CRITICAL_RATIO
      ? "bg-red-600"
      : ratio >= STORAGE_WARN_RATIO
        ? "bg-amber-500"
        : "bg-royal-600";
  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-royal-100 ${size === "sm" ? "h-1.5" : "h-2.5"}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
    >
      {totalBytes !== null && (
        <div
          className={`h-full rounded-full ${color}`}
          // At least a sliver once anything is used, so 0.3% isn't invisible.
          style={{ width: `${usedBytes > 0 ? Math.max(ratio * 100, 1) : 0}%` }}
        />
      )}
    </div>
  );
}

export function usageTextColor(usedBytes: number, totalBytes: number | null): string {
  if (!totalBytes) return "text-royal-500";
  const ratio = usedBytes / totalBytes;
  if (ratio >= STORAGE_CRITICAL_RATIO) return "text-red-600";
  if (ratio >= STORAGE_WARN_RATIO) return "text-amber-700";
  return "text-royal-500";
}
