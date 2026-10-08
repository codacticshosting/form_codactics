"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Search, Trash2, X } from "lucide-react";
import { deleteResponse } from "@/lib/response-actions";

export interface ResponseAnswerDisplay {
  label: string;
  value:
    | { kind: "text"; text: string }
    | { kind: "file"; storedPath: string; originalName: string };
}

export interface ResponseRow {
  id: string;
  submittedAtMs: number;
  submittedAtDisplay: string;
  accessUsername: string | null;
  // Every answer's label + text (or filename), lowercased and joined —
  // built once server-side so filtering here is a plain substring check,
  // not re-walking the whole answer structure on every keystroke.
  searchText: string;
  answers: ResponseAnswerDisplay[];
  playerLists: { listLabel: string; entries: ResponseAnswerDisplay[][] }[];
  buttonAnswers: { groupLabel: string; entries: ResponseAnswerDisplay[] }[];
}

function AnswerValue({ value }: { value: ResponseAnswerDisplay["value"] }) {
  if (value.kind === "file") {
    return (
      <a
        href={`/api/uploads/${value.storedPath}`}
        className="inline-flex items-center gap-1.5 text-royal-600 hover:underline"
      >
        <Download size={12} />
        {value.originalName}
      </a>
    );
  }
  return <>{value.text || "—"}</>;
}

function DeleteResponseButton({ formId, submissionId }: { formId: string; submissionId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm("Delete this response and its uploaded files? This can't be undone.")) {
      return;
    }
    startTransition(async () => {
      const result = await deleteResponse(formId, submissionId);
      if (!result.ok) window.alert("Couldn't delete this response. Please reload and try again.");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      aria-label="Delete this response"
      className="ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-red-500 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
    >
      <Trash2 size={12} />
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}

export function ResponsesList({ formId, rows }: { formId: string; rows: ResponseRow[] }) {
  const [query, setQuery] = useState("");
  const [username, setUsername] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const usernames = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      if (row.accessUsername) set.add(row.accessUsername);
    }
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    // Inclusive of the whole "to" day, not just midnight at its start.
    const to = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;

    return rows.filter((row) => {
      if (q && !row.searchText.includes(q)) return false;
      if (username !== "all" && row.accessUsername !== username) return false;
      if (from !== null && row.submittedAtMs < from) return false;
      if (to !== null && row.submittedAtMs > to) return false;
      return true;
    });
  }, [rows, query, username, fromDate, toDate]);

  const hasActiveFilters = query || username !== "all" || fromDate || toDate;

  function clearFilters() {
    setQuery("");
    setUsername("all");
    setFromDate("");
    setToDate("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border border-royal-100 bg-white p-3">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-royal-300"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search responses…"
            className="w-full rounded-md border border-royal-200 py-2 pl-8 pr-3 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {usernames.length > 0 && (
            <select
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="rounded-md border border-royal-200 px-2 py-1.5 text-xs text-royal-700 focus:border-royal-500 focus:outline-none"
            >
              <option value="all">All users</option>
              {usernames.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-1.5 text-xs text-royal-500">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-royal-200 px-2 py-1.5 text-xs text-royal-700 focus:border-royal-500 focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-royal-500">
            To
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-royal-200 px-2 py-1.5 text-xs text-royal-700 focus:border-royal-500 focus:outline-none"
            />
          </label>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs font-medium text-royal-500 hover:underline"
            >
              <X size={11} />
              Clear filters
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-royal-400">
        {hasActiveFilters
          ? `${filtered.length} of ${rows.length} response${rows.length === 1 ? "" : "s"} match`
          : `${rows.length} response${rows.length === 1 ? "" : "s"}`}
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-royal-200 bg-white p-8 text-center text-sm text-royal-400">
          {hasActiveFilters ? "No responses match these filters." : "No responses yet."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-royal-100 bg-white p-5 shadow-sm"
            >
              <p className="mb-3 flex items-center gap-2 text-xs font-medium text-royal-400">
                {row.submittedAtDisplay}
                {row.accessUsername && (
                  <span className="rounded-full bg-royal-100 px-2 py-0.5 text-royal-600">
                    {row.accessUsername}
                  </span>
                )}
                <DeleteResponseButton formId={formId} submissionId={row.id} />
              </p>
              <div className="flex flex-col gap-3">
                {row.answers.map((answer, i) => (
                  <div key={i}>
                    <p className="text-xs font-medium text-royal-500">{answer.label}</p>
                    <div className="mt-0.5 text-sm text-royal-950">
                      <AnswerValue value={answer.value} />
                    </div>
                  </div>
                ))}
                {row.playerLists.map((list, i) => (
                  <div key={i}>
                    <p className="text-xs font-medium text-royal-500">{list.listLabel}</p>
                    <div className="mt-1 flex flex-col gap-2">
                      {list.entries.map((entry, j) => (
                        <div
                          key={j}
                          className="rounded-lg border border-royal-100 p-2.5 text-sm"
                        >
                          <p className="mb-1 text-xs font-semibold text-royal-500">
                            Entry {j + 1}
                          </p>
                          <div className="flex flex-col gap-1">
                            {entry.map((col, k) => (
                              <div key={k} className="text-royal-950">
                                <span className="text-royal-500">{col.label}: </span>
                                <AnswerValue value={col.value} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {row.buttonAnswers.map((group, i) => (
                  <div key={i}>
                    <p className="text-xs font-medium text-royal-500">{group.groupLabel}</p>
                    <div className="mt-1 flex flex-col gap-1 rounded-lg border border-royal-100 p-2.5 text-sm">
                      {group.entries.map((col, j) => (
                        <div key={j} className="text-royal-950">
                          <span className="text-royal-500">{col.label}: </span>
                          <AnswerValue value={col.value} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
