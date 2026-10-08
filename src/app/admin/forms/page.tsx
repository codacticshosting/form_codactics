import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Pencil, Plus, Inbox, Settings } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UserMenu } from "@/components/UserMenu";
import { DeleteFormButton } from "@/components/forms/DeleteFormButton";
import { CreateFormButton } from "@/components/forms/CreateFormButton";
import { ArchiveFormButton } from "@/components/forms/ArchiveFormButton";
import { UnarchiveFormButton } from "@/components/forms/UnarchiveFormButton";
import { DuplicateFormButton } from "@/components/forms/DuplicateFormButton";
import { StorageSummary } from "@/components/storage/StorageSummary";
import { getAdminStorageSummary } from "@/lib/storage-quota";
import { binPurgeDate, purgeExpiredBinnedForms } from "@/lib/form-bin";
import { BinFormActions } from "@/components/forms/BinFormActions";
import { AccountDeletionNotice } from "@/components/account/AccountDeletionNotice";
import { accountDeletionDate, purgeDeletedAccounts } from "@/lib/account-deletion";
import {
  BIN_LIMIT,
  BIN_RETENTION_DAYS,
  MAX_DRAFTS_PER_ADMIN,
  MAX_PUBLISHED_PER_ADMIN,
  effectiveDraftLimit,
  effectivePublishedLimit,
} from "@/lib/form-limits";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function ManageFormsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/admin/forms");
  }

  // Accounts and Bin entries whose time is up are erased for good before
  // anything is listed or measured.
  await purgeDeletedAccounts();
  await purgeExpiredBinnedForms(session.user.id);

  const owner = await prisma.admin.findUnique({
    where: { id: session.user.id },
    select: { deletionRequestedAt: true },
  });
  if (!owner) redirect("/login?callbackUrl=/admin/forms");
  if (owner.deletionRequestedAt) {
    // An account scheduled for deletion shows only that — no forms.
    return (
      <div className="flex flex-1 flex-col bg-background">
        <header className="sticky top-0 z-20 border-b border-royal-100 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-3">
            <span className="text-lg font-semibold text-royal-950">Manage forms</span>
            <div className="flex-1" />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-2xl flex-col px-6 py-12">
          <AccountDeletionNotice
            deletionDate={new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
              accountDeletionDate(owner.deletionRequestedAt),
            )}
          />
        </main>
      </div>
    );
  }

  const [admin, drafts, published, archived, binned, storage] = await Promise.all([
    prisma.admin.findUnique({ where: { id: session.user.id } }),
    prisma.form.findMany({
      where: { adminId: session.user.id, status: "draft" },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.form.findMany({
      where: {
        adminId: session.user.id,
        status: { in: ["published", "maintenance"] },
      },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.form.findMany({
      where: { adminId: session.user.id, status: "archived" },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.form.findMany({
      where: { adminId: session.user.id, status: "binned" },
      orderBy: { binnedAt: "desc" },
    }),
    getAdminStorageSummary(session.user.id),
  ]);
  const draftLimit = admin ? effectiveDraftLimit(admin) : MAX_DRAFTS_PER_ADMIN;
  const publishedLimit = admin ? effectivePublishedLimit(admin) : MAX_PUBLISHED_PER_ADMIN;

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-royal-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-3">
          <Link
            href="/"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-royal-500 hover:bg-royal-50"
            aria-label="Back to home"
          >
            <ArrowLeft size={18} />
          </Link>
          <span className="text-lg font-semibold text-royal-950">
            Manage forms
          </span>
          <div className="flex-1" />
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-8">
        <CreateFormButton className="self-start rounded-full bg-royal-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-royal-700 disabled:cursor-not-allowed disabled:opacity-60">
          <span className="flex items-center gap-1.5">
            <Plus size={15} />
            Create a new form
          </span>
        </CreateFormButton>

        <StorageSummary summary={storage} />

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-royal-950">
            Drafts ({drafts.length}/{draftLimit})
          </h2>
          {drafts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-royal-200 bg-white p-6 text-center text-sm text-royal-400">
              No drafts yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {drafts.map((form) => (
                <div
                  key={form.id}
                  className="flex items-center gap-3 rounded-xl border border-royal-100 bg-white p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-royal-950">
                      {form.title}
                    </p>
                    <p className="text-xs text-royal-400">
                      Last edited {formatDate(form.updatedAt)}
                    </p>
                  </div>
                  <Link
                    href={`/admin/new?formId=${form.id}`}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-royal-200 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50"
                  >
                    <Pencil size={12} />
                    Edit
                  </Link>
                  <DuplicateFormButton formId={form.id} />
                  <DeleteFormButton formId={form.id} formTitle={form.title} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-royal-950">
            Published ({published.length}/{publishedLimit})
          </h2>
          {published.length === 0 ? (
            <p className="rounded-xl border border-dashed border-royal-200 bg-white p-6 text-center text-sm text-royal-400">
              Nothing published yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {published.map((form) => (
                <div
                  key={form.id}
                  className="flex items-center gap-3 rounded-xl border border-royal-100 bg-white p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-royal-950">
                        {form.title}
                      </p>
                      {form.status === "maintenance" && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          Under maintenance
                        </span>
                      )}
                      {storage.isFull && form.storageProvider === "local" && (
                        <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                          Storage full — not accepting responses
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-royal-400">
                      /{form.slug} · published{" "}
                      {form.publishedAt ? formatDate(form.publishedAt) : ""}
                    </p>
                  </div>
                  <Link
                    href={`/admin/new?formId=${form.id}`}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-royal-200 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50"
                  >
                    <Pencil size={12} />
                    Edit
                  </Link>
                  <a
                    href={`/${form.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-royal-200 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50"
                  >
                    <ExternalLink size={12} />
                    View
                  </a>
                  {form.storageProvider === "local" && (
                    <Link
                      href={`/admin/forms/${form.id}/responses`}
                      className="flex shrink-0 items-center gap-1.5 rounded-full border border-royal-200 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50"
                    >
                      <Inbox size={12} />
                      Responses
                    </Link>
                  )}
                  <Link
                    href={`/admin/forms/${form.id}/settings`}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-royal-200 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50"
                  >
                    <Settings size={12} />
                    Settings
                  </Link>
                  <ArchiveFormButton formId={form.id} />
                  <DuplicateFormButton formId={form.id} />
                  <DeleteFormButton formId={form.id} formTitle={form.title} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-royal-950">
            Archived ({archived.length})
          </h2>
          {archived.length === 0 ? (
            <p className="rounded-xl border border-dashed border-royal-200 bg-white p-6 text-center text-sm text-royal-400">
              Nothing archived.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {archived.map((form) => (
                <div
                  key={form.id}
                  className="flex items-center gap-3 rounded-xl border border-royal-100 bg-white p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-royal-950">
                      {form.title}
                    </p>
                    <p className="truncate text-xs text-royal-400">
                      /{form.slug} · last edited {formatDate(form.updatedAt)}
                    </p>
                  </div>
                  <UnarchiveFormButton formId={form.id} />
                  <DuplicateFormButton formId={form.id} />
                  <DeleteFormButton formId={form.id} formTitle={form.title} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-royal-950">
              Bin ({binned.length}/{BIN_LIMIT})
            </h2>
            <p className="text-xs text-royal-400">
              Deleted forms stay here for {BIN_RETENTION_DAYS} days and can be restored. After that
              they&apos;re deleted for good, with all their responses and files, and their storage
              is freed. The Bin keeps up to {BIN_LIMIT} forms.
            </p>
          </div>
          {binned.length === 0 ? (
            <p className="rounded-xl border border-dashed border-royal-200 bg-white p-6 text-center text-sm text-royal-400">
              The Bin is empty.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {binned.map((form) => (
                <div
                  key={form.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-royal-100 bg-white p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-royal-950">{form.title}</p>
                    <p className="text-xs text-royal-400">
                      Deleted {form.binnedAt ? formatDate(form.binnedAt) : ""}
                      {form.binnedAt && (
                        <>
                          {" "}
                          · deleted for good on {formatDate(binPurgeDate(form.binnedAt))}
                        </>
                      )}
                    </p>
                  </div>
                  <BinFormActions formId={form.id} formTitle={form.title} />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
