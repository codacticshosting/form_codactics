import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Inbox } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/super-admin";
import { MAX_DRAFTS_PER_ADMIN, MAX_PUBLISHED_PER_ADMIN } from "@/lib/form-limits";
import { UserMenu } from "@/components/UserMenu";
import { AdminLimitsRow } from "@/components/super-admin/AdminLimitsRow";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

export default async function ControlPanelPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login?callbackUrl=/admin/control-panel");
  }
  // Not found rather than a "forbidden" page — this route's existence
  // isn't something a regular admin needs to know about.
  if (!isSuperAdminEmail(session.user.email)) {
    notFound();
  }

  const [admins, newMessageCount] = await Promise.all([
    prisma.admin.findMany({
      orderBy: { createdAt: "asc" },
      include: { forms: { select: { status: true } } },
    }),
    prisma.contactMessage.count({ where: { status: "new" } }),
  ]);

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-royal-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-3">
          <Link
            href="/admin/forms"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-royal-500 hover:bg-royal-50"
            aria-label="Back to Manage forms"
          >
            <ArrowLeft size={18} />
          </Link>
          <span className="text-lg font-semibold text-royal-950">
            Control panel
          </span>
          <div className="flex-1" />
          <Link
            href="/admin/control-panel/inbox"
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-royal-200 px-3 py-1.5 text-sm font-medium text-royal-600 hover:bg-royal-50"
          >
            <Inbox size={16} />
            Inbox
            {newMessageCount > 0 && (
              <span className="rounded-full bg-royal-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {newMessageCount} new
              </span>
            )}
          </Link>
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-8">
        <p className="text-sm text-royal-500">
          Every account that has signed in, oldest first. Default limit is{" "}
          {MAX_DRAFTS_PER_ADMIN} drafts / {MAX_PUBLISHED_PER_ADMIN} published —
          leave a box blank to use that default, or set a number to override
          it for that one account.
        </p>

        {admins.length === 0 ? (
          <p className="rounded-xl border border-dashed border-royal-200 bg-white p-6 text-center text-sm text-royal-400">
            No one has signed in yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {admins.map((admin) => {
              const draftCount = admin.forms.filter(
                (f) => f.status === "draft",
              ).length;
              const publishedCount = admin.forms.filter(
                (f) => f.status === "published" || f.status === "maintenance",
              ).length;
              return (
                <AdminLimitsRow
                  key={admin.id}
                  adminId={admin.id}
                  email={admin.email}
                  name={admin.name}
                  joined={formatDate(admin.createdAt)}
                  draftCount={draftCount}
                  publishedCount={publishedCount}
                  maxDrafts={admin.maxDrafts}
                  maxPublished={admin.maxPublished}
                  loginLimitFeatureEnabled={admin.loginLimitFeatureEnabled}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
