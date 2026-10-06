import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  normalizeAnswer,
  normalizeButtonAnswer,
  normalizePlayerList,
  type LocalAnswerValue,
  type LocalSubmissionData,
} from "@/lib/local-storage";
import { formatBerlinDate, formatBerlinTime } from "@/lib/timezones";

function csvSafeName(input: string): string {
  return input.trim().replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase() || "form";
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function displayValue(value: LocalAnswerValue | undefined): string {
  if (!value) return "";
  if (value.kind === "file") return value.originalName;
  return value.text;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ formId: string }> },
) {
  const { formId } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") === "csv" ? "csv" : "json";

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (
    !form ||
    form.adminId !== session.user.id ||
    form.storageProvider !== "local"
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const submissions = await prisma.submission.findMany({
    where: { formId },
    orderBy: { submittedAt: "asc" },
  });

  const rows = submissions.map((submission) => {
    const raw = JSON.parse(submission.dataJson) as LocalSubmissionData;
    const answers: Record<string, { label: string; value: LocalAnswerValue }> = {};
    for (const [fieldId, value] of Object.entries(raw.answers)) {
      answers[fieldId] = normalizeAnswer(fieldId, value);
    }
    const playerLists: Record<
      string,
      { listLabel: string; entries: { label: string; value: LocalAnswerValue }[][] }
    > = {};
    for (const [fieldId, value] of Object.entries(raw.playerListEntries ?? {})) {
      playerLists[fieldId] = normalizePlayerList(fieldId, value);
    }
    const buttonGroups: Record<
      string,
      { groupLabel: string; entries: { label: string; value: LocalAnswerValue }[] }
    > = {};
    for (const [fieldId, value] of Object.entries(raw.buttonAnswers ?? {})) {
      buttonGroups[fieldId] = normalizeButtonAnswer(fieldId, value);
    }
    return {
      id: submission.id,
      // German local time (auto-adjusts for CET/CEST), split into separate
      // date and time columns rather than one combined UTC timestamp.
      submittedDate: formatBerlinDate(submission.submittedAt),
      submittedTime: formatBerlinTime(submission.submittedAt),
      accessUsername: raw.accessUsername ?? "",
      answers,
      playerLists,
      buttonGroups,
    };
  });

  const safeTitle = csvSafeName(form.title);

  if (format === "json") {
    const json = JSON.stringify(
      rows.map((r) => ({
        submissionId: r.id,
        submittedDate: r.submittedDate,
        submittedTime: r.submittedTime,
        submittedTimezone: "Europe/Berlin",
        username: r.accessUsername,
        answers: Object.fromEntries(
          Object.values(r.answers).map((a) => [a.label, displayValue(a.value)]),
        ),
        playerListEntries: Object.fromEntries(
          Object.values(r.playerLists).map((l) => [
            l.listLabel,
            l.entries.map((row) =>
              Object.fromEntries(row.map((c) => [c.label, displayValue(c.value)])),
            ),
          ]),
        ),
        buttonAnswers: Object.fromEntries(
          Object.values(r.buttonGroups).map((g) => [
            g.groupLabel,
            Object.fromEntries(g.entries.map((c) => [c.label, displayValue(c.value)])),
          ]),
        ),
      })),
      null,
      2,
    );
    return new NextResponse(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${safeTitle}-responses.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  // CSV: one row per submission. Columns are the union of every field id
  // seen across all submissions (fields can change over time as the form
  // is edited), with duplicate labels disambiguated so two different
  // fields sharing the default "Untitled question" label don't collapse
  // into a single column header.
  const fieldIdOrder: string[] = [];
  const labelForFieldId = new Map<string, string>();
  for (const row of rows) {
    for (const [fieldId, answer] of Object.entries(row.answers)) {
      if (!labelForFieldId.has(fieldId)) {
        fieldIdOrder.push(fieldId);
        labelForFieldId.set(fieldId, answer.label);
      }
    }
  }
  const listFieldIdOrder: string[] = [];
  const listLabelForFieldId = new Map<string, string>();
  for (const row of rows) {
    for (const [fieldId, list] of Object.entries(row.playerLists)) {
      if (!listLabelForFieldId.has(fieldId)) {
        listFieldIdOrder.push(fieldId);
        listLabelForFieldId.set(fieldId, list.listLabel);
      }
    }
  }
  const buttonFieldIdOrder: string[] = [];
  const buttonLabelForFieldId = new Map<string, string>();
  for (const row of rows) {
    for (const [fieldId, group] of Object.entries(row.buttonGroups)) {
      if (!buttonLabelForFieldId.has(fieldId)) {
        buttonFieldIdOrder.push(fieldId);
        buttonLabelForFieldId.set(fieldId, group.groupLabel);
      }
    }
  }

  const usedHeaders = new Set<string>();
  function dedupedHeader(label: string): string {
    let header = label || "Untitled";
    let n = 2;
    while (usedHeaders.has(header)) {
      header = `${label || "Untitled"} (${n})`;
      n += 1;
    }
    usedHeaders.add(header);
    return header;
  }

  const fieldHeaders = fieldIdOrder.map((id) => dedupedHeader(labelForFieldId.get(id)!));
  const listHeaders = listFieldIdOrder.map((id) =>
    dedupedHeader(listLabelForFieldId.get(id)!),
  );
  const buttonHeaders = buttonFieldIdOrder.map((id) =>
    dedupedHeader(buttonLabelForFieldId.get(id)!),
  );

  const header = [
    "Submission ID",
    "Submitted Date (Germany)",
    "Submitted Time (Germany)",
    "Username",
    ...fieldHeaders,
    ...listHeaders,
    ...buttonHeaders,
  ];
  const lines = [header.map(csvCell).join(",")];

  for (const row of rows) {
    const cells = [row.id, row.submittedDate, row.submittedTime, row.accessUsername];
    for (const fieldId of fieldIdOrder) {
      cells.push(displayValue(row.answers[fieldId]?.value));
    }
    for (const fieldId of listFieldIdOrder) {
      const list = row.playerLists[fieldId];
      const summary = list
        ? list.entries
            .map(
              (r, i) =>
                `Entry ${i + 1}: ${r.map((c) => `${c.label}: ${displayValue(c.value)}`).join(", ")}`,
            )
            .join(" | ")
        : "";
      cells.push(summary);
    }
    for (const fieldId of buttonFieldIdOrder) {
      const group = row.buttonGroups[fieldId];
      const summary = group
        ? group.entries.map((c) => `${c.label}: ${displayValue(c.value)}`).join(", ")
        : "";
      cells.push(summary);
    }
    lines.push(cells.map(csvCell).join(","));
  }

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeTitle}-responses.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
