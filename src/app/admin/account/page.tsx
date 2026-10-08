import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UserMenu } from "@/components/UserMenu";
import { DeleteAccountSection } from "@/components/account/DeleteAccountSection";
import { AccountDeletionNotice } from "@/components/account/AccountDeletionNotice";
import { accountDeletionDate, purgeDeletedAccounts } from "@/lib/account-deletion";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(date);
}

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/login?callbackUrl=/admin/account");
  }

  await purgeDeletedAccounts({ email: session.user.email });
  const admin = await prisma.admin.findUnique({ where: { id: session.user.id } });
  if (!admin) redirect("/login?callbackUrl=/admin/account");

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-royal-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-6 py-3">
          <Link
            href="/admin/forms"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-royal-500 hover:bg-royal-50"
            aria-label="Back to Manage forms"
          >
            <ArrowLeft size={18} />
          </Link>
          <span className="text-lg font-semibold text-royal-950">Account</span>
          <div className="flex-1" />
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
        <section className="flex flex-col gap-1 rounded-xl border border-royal-100 bg-white p-5">
          <p className="text-sm font-medium text-royal-950">{admin.name || admin.email}</p>
          <p className="text-xs text-royal-500">
            {admin.email} · member since {formatDate(admin.createdAt)}
          </p>
        </section>

        {admin.deletionRequestedAt ? (
          <AccountDeletionNotice
            deletionDate={formatDate(accountDeletionDate(admin.deletionRequestedAt))}
          />
        ) : (
          <DeleteAccountSection />
        )}
      </main>
    </div>
  );
}
