import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/super-admin";
import { purgeExpiredContactMessages } from "@/lib/contact-inbox";
import {
  CONTACT_RETENTION_DAYS,
  type ContactMessageStatus,
} from "@/lib/contact-messages";
import { UserMenu } from "@/components/UserMenu";
import { ContactMessageRow } from "@/components/super-admin/ContactMessageRow";

const TABS = {
  inbox: { label: "Inbox", statuses: ["new", "read"], orderBy: "createdAt" },
  archived: { label: "Archived", statuses: ["archived"], orderBy: "archivedAt" },
  trash: { label: "Trash", statuses: ["deleted"], orderBy: "deletedAt" },
} as const;
type TabKey = keyof typeof TABS;

const TAB_NOTES: Record<TabKey, string> = {
  inbox: `Unread messages are kept for ${CONTACT_RETENTION_DAYS.new} days, read ones for ${CONTACT_RETENTION_DAYS.read} days after being read.`,
  archived: `Archived messages are deleted permanently ${CONTACT_RETENTION_DAYS.archived} days after archiving. Restore one to move it back to the inbox.`,
  trash: `Messages in Trash are deleted permanently ${CONTACT_RETENTION_DAYS.deleted} days after being deleted. Restore one to move it back to the inbox.`,
};

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

// When this message will be purged, given its current status — the same
// rule purgeExpiredContactMessages applies, just shown ahead of time.
function expiresOn(message: {
  status: string;
  createdAt: Date;
  readAt: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
}): Date | null {
  const status = message.status as ContactMessageStatus;
  const start = {
    new: message.createdAt,
    read: message.readAt,
    archived: message.archivedAt,
    deleted: message.deletedAt,
  }[status];
  if (!start) return null;
  return new Date(start.getTime() + CONTACT_RETENTION_DAYS[status] * DAY_MS);
}

export default async function ContactInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/control-panel/inbox");
  }
  // Same as the control panel itself — not found rather than forbidden.
  if (!isSuperAdminEmail(session.user.email)) {
    notFound();
  }

  const { tab: rawTab } = await searchParams;
  const tab: TabKey = rawTab && rawTab in TABS ? (rawTab as TabKey) : "inbox";
  const current = TABS[tab];

  await purgeExpiredContactMessages();

  const [messages, statusCounts] = await Promise.all([
    prisma.contactMessage.findMany({
      where: { status: { in: [...current.statuses] } },
      orderBy: { [current.orderBy]: "desc" },
      include: { admin: { select: { email: true } } },
    }),
    prisma.contactMessage.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countOf = (status: ContactMessageStatus) =>
    statusCounts.find((row) => row.status === status)?._count._all ?? 0;
  const tabCounts: Record<TabKey, number> = {
    inbox: countOf("new") + countOf("read"),
    archived: countOf("archived"),
    trash: countOf("deleted"),
  };
  const newCount = countOf("new");

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-royal-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-3">
          <Link
            href="/admin/control-panel"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-royal-500 hover:bg-royal-50"
            aria-label="Back to Control panel"
          >
            <ArrowLeft size={18} />
          </Link>
          <span className="text-lg font-semibold text-royal-950">
            Contact inbox
          </span>
          <div className="flex-1" />
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-8">
        <nav className="flex flex-wrap gap-2" aria-label="Inbox folders">
          {(Object.keys(TABS) as TabKey[]).map((key) => (
            <Link
              key={key}
              href={key === "inbox" ? "/admin/control-panel/inbox" : `/admin/control-panel/inbox?tab=${key}`}
              aria-current={key === tab ? "page" : undefined}
              className={
                key === tab
                  ? "rounded-full bg-royal-600 px-4 py-1.5 text-sm font-medium text-white"
                  : "rounded-full border border-royal-200 bg-white px-4 py-1.5 text-sm font-medium text-royal-600 hover:bg-royal-50"
              }
            >
              {TABS[key].label} ({tabCounts[key]})
              {key === "inbox" && newCount > 0 && ` · ${newCount} new`}
            </Link>
          ))}
        </nav>

        <p className="text-sm text-royal-500">{TAB_NOTES[tab]}</p>

        {messages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-royal-200 bg-white p-6 text-center text-sm text-royal-400">
            No messages here.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((message) => {
              const expiry = expiresOn(message);
              return (
                <ContactMessageRow
                  key={message.id}
                  id={message.id}
                  name={message.name}
                  email={message.email}
                  message={message.message}
                  status={message.status as ContactMessageStatus}
                  isFeatureRequest={message.source === "feature-request"}
                  isSignedInUser={message.admin !== null}
                  received={formatDateTime(message.createdAt)}
                  expires={expiry ? formatDate(expiry) : null}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
