import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Wrench, CalendarOff, HardDrive } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { FormRenderer } from "@/components/form/FormRenderer";
import { HeaderPreview } from "@/components/design/HeaderPreview";
import { PageBackground } from "@/components/design/PageBackground";
import { checkUploadFits, submitFormAction } from "./actions";
import { AccessGate } from "./AccessGate";
import { CLOSED_MESSAGE, isFormClosed } from "@/types/closing";
import { isAdminStorageFull } from "@/lib/storage-quota";
import { STORAGE_FULL_PAGE_MESSAGE, STORAGE_FULL_PAGE_TITLE } from "@/lib/storage-limits";
import type { FormField } from "@/types/form-builder";
import type { FormTheme } from "@/types/theme";

async function getForm(slug: string) {
  const form = await prisma.form.findUnique({
    where: { slug },
    include: { admin: { select: { deletionRequestedAt: true } } },
  });
  if (!form || (form.status !== "published" && form.status !== "maintenance")) return null;
  // The owner asked to delete their account — all their forms are offline.
  if (form.admin.deletionRequestedAt) return null;
  const isClosed = isFormClosed(form);
  return {
    id: form.id,
    adminId: form.adminId,
    storageProvider: form.storageProvider,
    compressPhotos: form.compressPhotos,
    title: form.title,
    status: form.status as "published" | "maintenance",
    isClosed,
    requireAccessCode: form.requireAccessCode,
    fields: JSON.parse(form.schema) as FormField[],
    theme: JSON.parse(form.theme) as FormTheme,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const form = await getForm(slug);
  return { title: form ? form.title : "Form not found" };
}

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const form = await getForm(slug);
  if (!form) notFound();

  if (form.status === "maintenance") {
    return (
      <PageBackground
        background={form.theme.pageBackground}
        className="flex-1 px-6 py-10"
        parallax
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <HeaderPreview theme={form.theme} title={form.title} />
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-royal-100 bg-white p-10 text-center shadow-sm">
            <Wrench size={28} className="text-royal-400" />
            <h2 className="text-lg font-semibold text-royal-950">
              The form is under maintenance
            </h2>
            <p className="max-w-sm text-sm text-royal-500">
              This form isn&apos;t accepting responses right now. Please
              check back later.
            </p>
          </div>
        </div>
      </PageBackground>
    );
  }

  if (form.isClosed) {
    return (
      <PageBackground
        background={form.theme.pageBackground}
        className="flex-1 px-6 py-10"
        parallax
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <HeaderPreview theme={form.theme} title={form.title} />
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-royal-100 bg-white p-10 text-center shadow-sm">
            <CalendarOff size={28} className="text-royal-400" />
            <h2 className="text-lg font-semibold text-royal-950">
              Responses closed
            </h2>
            <p className="max-w-sm text-sm text-royal-500">{CLOSED_MESSAGE}</p>
          </div>
        </div>
      </PageBackground>
    );
  }

  // Shown before anyone starts filling the form in — when the owner's
  // storage is full, nothing would be accepted anyway. Google Drive forms
  // store responses in the owner's own Drive, so this never applies.
  if (form.storageProvider === "local" && (await isAdminStorageFull(form.adminId))) {
    return (
      <PageBackground
        background={form.theme.pageBackground}
        className="flex-1 px-6 py-10"
        parallax
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <HeaderPreview theme={form.theme} title={form.title} />
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-royal-100 bg-white p-10 text-center shadow-sm">
            <HardDrive size={28} className="text-royal-400" />
            <h2 className="text-lg font-semibold text-royal-950">{STORAGE_FULL_PAGE_TITLE}</h2>
            <p className="max-w-sm text-sm text-royal-500">{STORAGE_FULL_PAGE_MESSAGE}</p>
          </div>
        </div>
      </PageBackground>
    );
  }

  if (form.requireAccessCode) {
    return (
      <PageBackground
        background={form.theme.pageBackground}
        className="flex-1 px-6 py-10"
        parallax
      >
        <AccessGate
          slug={slug}
          title={form.title}
          theme={form.theme}
          fields={form.fields}
          submitAction={submitFormAction.bind(null, slug)}
          checkUploadFits={checkUploadFits.bind(null, slug)}
          compressPhotos={form.compressPhotos}
        />
      </PageBackground>
    );
  }

  return (
    <PageBackground background={form.theme.pageBackground} className="flex-1 px-6 py-10" parallax>
      <div className="mx-auto max-w-3xl">
        <FormRenderer
          title={form.title}
          fields={form.fields}
          theme={form.theme}
          submitAction={submitFormAction.bind(null, slug)}
          checkUploadFits={checkUploadFits.bind(null, slug)}
          compressPhotos={form.compressPhotos}
        />
      </div>
    </PageBackground>
  );
}
