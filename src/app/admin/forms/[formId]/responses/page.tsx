import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileJson, FileSpreadsheet } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UserMenu } from "@/components/UserMenu";
import {
  normalizeAnswer,
  normalizeButtonAnswer,
  normalizePlayerList,
  type LocalSubmissionData,
  type LocalAnswerValue,
} from "@/lib/local-storage";
import { formatBerlinDate, formatBerlinTime } from "@/lib/timezones";
import { ResponsesList, type ResponseRow, type ResponseAnswerDisplay } from "@/components/admin/ResponsesList";
import { DeleteAllResponsesButton } from "@/components/admin/DeleteAllResponsesButton";

// German local time, auto-adjusted for CET/CEST — not the server's own
// timezone, which may not be Germany's at all depending on where it's hosted.
function formatDate(date: Date) {
  return `${formatBerlinDate(date)} · ${formatBerlinTime(date)}`;
}

function toDisplayValue(value: LocalAnswerValue): ResponseAnswerDisplay["value"] {
  if (!value) return { kind: "text", text: "" };
  if (value.kind === "file") {
    return { kind: "file", storedPath: value.storedPath, originalName: value.originalName };
  }
  return { kind: "text", text: value.text ?? "" };
}

function searchTextFor(value: LocalAnswerValue): string {
  if (!value) return "";
  return value.kind === "file" ? value.originalName : value.text ?? "";
}

export default async function ResponsesPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/admin/forms/${formId}/responses`);
  }

  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (
    !form ||
    form.adminId !== session.user.id ||
    form.storageProvider !== "local"
  ) {
    notFound();
  }

  const submissions = await prisma.submission.findMany({
    where: { formId },
    orderBy: { submittedAt: "desc" },
  });

  const rows: ResponseRow[] = submissions.map((submission) => {
    const data = JSON.parse(submission.dataJson) as LocalSubmissionData;
    const searchParts: string[] = [];
    if (data.accessUsername) searchParts.push(data.accessUsername);

    const answers: ResponseAnswerDisplay[] = Object.entries(data.answers).map(
      ([fieldId, raw]) => {
        const answer = normalizeAnswer(fieldId, raw);
        searchParts.push(answer.label, searchTextFor(answer.value));
        return { label: answer.label, value: toDisplayValue(answer.value) };
      },
    );

    const playerLists = Object.entries(data.playerListEntries ?? {}).map(
      ([fieldId, raw]) => {
        const { listLabel, entries } = normalizePlayerList(fieldId, raw);
        searchParts.push(listLabel);
        const displayEntries = entries.map((entry) =>
          entry.map((col) => {
            searchParts.push(col.label, searchTextFor(col.value));
            return { label: col.label, value: toDisplayValue(col.value) };
          }),
        );
        return { listLabel, entries: displayEntries };
      },
    );

    const buttonAnswers = Object.entries(data.buttonAnswers ?? {}).map(
      ([fieldId, raw]) => {
        const { groupLabel, entries } = normalizeButtonAnswer(fieldId, raw);
        searchParts.push(groupLabel);
        const displayEntries = entries.map((col) => {
          searchParts.push(col.label, searchTextFor(col.value));
          return { label: col.label, value: toDisplayValue(col.value) };
        });
        return { groupLabel, entries: displayEntries };
      },
    );

    return {
      id: submission.id,
      submittedAtMs: submission.submittedAt.getTime(),
      submittedAtDisplay: formatDate(submission.submittedAt),
      accessUsername: data.accessUsername ?? null,
      searchText: searchParts.join(" ").toLowerCase(),
      answers,
      playerLists,
      buttonAnswers,
    };
  });

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
            {form.title} — Responses
          </span>
          <div className="flex-1" />
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-royal-500">
            Stored locally on this server, not through Google.
          </p>
          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`/api/forms/${formId}/export?format=csv`}
                className="flex items-center gap-1.5 rounded-full border border-royal-200 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50"
              >
                <FileSpreadsheet size={12} />
                Export CSV
              </a>
              <a
                href={`/api/forms/${formId}/export?format=json`}
                className="flex items-center gap-1.5 rounded-full border border-royal-200 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50"
              >
                <FileJson size={12} />
                Export JSON
              </a>
              <DeleteAllResponsesButton formId={formId} responseCount={rows.length} />
            </div>
          )}
        </div>

        <ResponsesList formId={formId} rows={rows} />
      </main>
    </div>
  );
}
