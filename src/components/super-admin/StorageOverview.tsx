import { HardDrive } from "lucide-react";
import type { ServerStorageOverview } from "@/lib/storage-quota";
import { formatBytes, formatMB, MB } from "@/lib/storage-limits";
import { UsageBar } from "@/components/storage/UsageBar";

export interface TopStorageUser {
  label: string;
  email: string;
  usedBytes: number;
  quotaBytes: number | null;
}

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: "warn" | "bad" }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-royal-100 bg-white px-4 py-3">
      <span
        className={`text-xl font-semibold ${
          tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-700" : "text-royal-950"
        }`}
      >
        {value}
      </span>
      <span className="text-xs text-royal-500">{label}</span>
    </div>
  );
}

function BreakdownItem({ label, bytes }: { label: string; bytes: number }) {
  return (
    <span className="whitespace-nowrap">
      {label} <span className="font-medium text-royal-800">{formatBytes(bytes)}</span>
    </span>
  );
}

export function StorageOverview({
  overview,
  topUsers,
}: {
  overview: ServerStorageOverview;
  topUsers: TopStorageUser[];
}) {
  const { disk, settings } = overview;
  const trackedBytes = overview.formsBytes + overview.responsesBytes;
  const otherBytes = disk
    ? Math.max(0, disk.usedBytes - trackedBytes - overview.databaseBytes)
    : 0;
  const reserveBytes = settings.reserveMB * MB;
  const limitedAdmins = overview.adminCount - overview.adminsUnlimited;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-royal-950">Storage</h2>

      <div className="flex flex-col gap-3 rounded-xl border border-royal-100 bg-white p-4">
        <div className="flex items-center gap-2">
          <HardDrive size={18} className="text-royal-500" />
          <span className="text-sm font-medium text-royal-950">Server disk</span>
        </div>
        {disk ? (
          <>
            <UsageBar usedBytes={disk.usedBytes} totalBytes={disk.totalBytes} />
            <p className="text-sm text-royal-700">
              <span className="font-semibold text-royal-950">{formatBytes(disk.usedBytes)}</span> of{" "}
              {formatBytes(disk.totalBytes)} used ·{" "}
              <span className="font-semibold text-royal-950">{formatBytes(disk.freeBytes)}</span> free
            </p>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-royal-500">
              <BreakdownItem label="Responses" bytes={overview.responsesBytes} />
              <BreakdownItem label="Forms & images" bytes={overview.formsBytes} />
              <BreakdownItem label="Database file" bytes={overview.databaseBytes} />
              <BreakdownItem label="Other" bytes={otherBytes} />
            </p>
            <p className="text-xs text-royal-500">
              File uploads stop for everyone when free space would drop below the{" "}
              {formatMB(settings.reserveMB)} reserve
              {disk.freeBytes < reserveBytes && (
                <span className="font-semibold text-red-600"> — that point has been reached now</span>
              )}
              . Total limit for all admins:{" "}
              {settings.totalLimitMB === null ? "the whole disk" : formatMB(settings.totalLimitMB)}.
            </p>
          </>
        ) : (
          <p className="text-sm text-royal-500">
            The server didn&apos;t report its disk size. Stored by admins:{" "}
            {formatBytes(trackedBytes)}.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile label="Admins" value={overview.adminCount} />
        <Tile label="Storing data" value={overview.adminsStoringData} />
        <Tile
          label="Near their quota (80%+)"
          value={overview.adminsNearQuota}
          tone={overview.adminsNearQuota > 0 ? "warn" : undefined}
        />
        <Tile
          label="Storage full"
          value={overview.adminsFull}
          tone={overview.adminsFull > 0 ? "bad" : undefined}
        />
        <Tile label="Custom quota" value={overview.adminsCustomQuota} />
        <Tile label="Unlimited" value={overview.adminsUnlimited} />
      </div>

      <div className="flex flex-col gap-1 rounded-xl border border-royal-100 bg-white p-4 text-sm text-royal-700">
        <p>
          <span className="font-semibold text-royal-950">{formatBytes(overview.allocatedBytes)}</span>{" "}
          allocated to {limitedAdmins} admin{limitedAdmins === 1 ? "" : "s"} with a quota ·{" "}
          <span className="font-semibold text-royal-950">{formatBytes(trackedBytes)}</span> actually
          used
          {disk && (
            <>
              {" "}
              · disk {formatBytes(disk.totalBytes)} (
              {Math.round((overview.allocatedBytes / disk.totalBytes) * 100)}% promised)
            </>
          )}
        </p>
        <p className="text-xs text-royal-400">
          Promising more than the disk holds is normal — most admins never fill their quota. The
          reserve keeps the server safe if many do.
        </p>
      </div>

      {topUsers.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-royal-100 bg-white p-4">
          <p className="text-sm font-medium text-royal-950">Top storage users</p>
          {topUsers.map((user) => (
            <div key={user.email} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <span className="truncate font-medium text-royal-800">{user.label}</span>
                <span className="text-royal-500">
                  {formatBytes(user.usedBytes)} /{" "}
                  {user.quotaBytes === null ? "Unlimited" : formatBytes(user.quotaBytes)}
                </span>
              </div>
              <UsageBar usedBytes={user.usedBytes} totalBytes={user.quotaBytes} size="sm" />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
