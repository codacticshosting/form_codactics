import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UserMenu } from "@/components/UserMenu";
import { AccessCodeSettings } from "@/components/design/AccessCodeSettings";

export default async function AccessCodesPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/admin/forms/${formId}/access`);
  }

  const [form, admin] = await Promise.all([
    prisma.form.findUnique({
      where: { id: formId },
      include: {
        accessCodes: {
          select: { id: true, username: true, maxLogins: true, loginCount: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.admin.findUnique({ where: { id: session.user.id } }),
  ]);
  if (!form || form.adminId !== session.user.id || !form.requireAccessCode) {
    notFound();
  }

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
          <span className="text-lg font-semibold text-royal-950">
            {form.title} — Access codes
          </span>
          <div className="flex-1" />
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-8">
        <p className="text-sm text-royal-500">
          Add, remove, or reset the username/password pairs that gate access
          to this form. Changes take effect immediately.
        </p>
        <div className="rounded-xl border border-royal-100 bg-white px-5 pb-5 shadow-sm">
          <AccessCodeSettings
            formId={form.id}
            initialRequireAccessCode={form.requireAccessCode}
            initialAccessCodes={form.accessCodes}
            loginLimitFeatureEnabled={admin?.loginLimitFeatureEnabled ?? false}
          />
        </div>
      </main>
    </div>
  );
}
