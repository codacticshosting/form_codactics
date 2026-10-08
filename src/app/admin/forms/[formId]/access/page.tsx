import { redirect } from "next/navigation";

// The access-codes page became the form's Settings page (access codes
// plus photo optimization) — kept as a redirect so old links still work.
export default async function AccessCodesPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  redirect(`/admin/forms/${formId}/settings`);
}
