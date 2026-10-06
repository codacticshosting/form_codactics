import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Wrench, CalendarOff } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { FormRenderer } from "@/components/form/FormRenderer";
import { HeaderPreview } from "@/components/design/HeaderPreview";
import { PageBackground } from "@/components/design/PageBackground";
import { submitFormAction } from "./actions";
import { AccessGate } from "./AccessGate";
import { CLOSED_MESSAGE, isFormClosed } from "@/types/closing";
import type { FormField } from "@/types/form-builder";
import type { FormTheme } from "@/types/theme";

async function getForm(slug: string) {
  const form = await prisma.form.findUnique({ where: { slug } });
  if (!form || form.status === "draft" || form.status === "archived") return null;
  const isClosed = isFormClosed(form);
  return {
    id: form.id,
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
        />
      </div>
    </PageBackground>
  );
}
