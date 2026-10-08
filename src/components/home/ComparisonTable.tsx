import { Check, X, Minus } from "lucide-react";

type Verdict = "yes" | "no" | "partial";

interface ComparisonRow {
  capability: string;
  codactis: { verdict: Verdict; note: string };
  others: { verdict: Verdict; note: string };
}

// Kept to the differentiators that hold up against form tools broadly —
// not a full feature list, and deliberately hedged ("usually", "depends on
// provider") rather than claiming an absolute win where the real answer
// varies by which tool and which plan someone's comparing against.
const ROWS: ComparisonRow[] = [
  {
    capability: "Tournament & competition registration",
    codactis: { verdict: "yes", note: "Built in — player lists, rankings, design boards" },
    others: { verdict: "partial", note: "Requires workarounds" },
  },
  {
    capability: "Reusable, admin-issued login credentials",
    codactis: { verdict: "yes", note: "A username & password you set" },
    others: { verdict: "no", note: "Usually not available" },
  },
  {
    capability: "Usage limits per credential",
    codactis: { verdict: "yes", note: "Set, reset, or raise it anytime" },
    others: { verdict: "no", note: "Usually not available" },
  },
  {
    capability: "Choice of where data is stored",
    codactis: { verdict: "yes", note: "Your own Google Drive, or kept on our server" },
    others: { verdict: "partial", note: "Platform-dependent" },
  },
  {
    capability: "Free to start",
    codactis: {
      verdict: "yes",
      note: "Free with 200 MB of storage — for more storage, contact us",
    },
    others: { verdict: "partial", note: "Depends on the provider and plan" },
  },
];

function VerdictCell({ verdict, note }: { verdict: Verdict; note: string }) {
  const icon =
    verdict === "yes" ? (
      <Check size={16} className="shrink-0 text-emerald-600" />
    ) : verdict === "no" ? (
      <X size={16} className="shrink-0 text-royal-300" />
    ) : (
      <Minus size={16} className="shrink-0 text-amber-500" />
    );
  return (
    <div className="flex items-start gap-2">
      {icon}
      <span className="text-sm leading-snug text-royal-600">{note}</span>
    </div>
  );
}

export function ComparisonTable() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-royal-950">
          See the full comparison
        </h2>
        <p className="max-w-xl text-sm text-royal-500">
          How Codactics Form compares with online form tools in general.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-royal-100 bg-white shadow-sm">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <thead>
            <tr className="border-b border-royal-100">
              <th className="px-5 py-3.5 text-xs font-medium text-royal-400">
                What you need
              </th>
              <th className="border-l-2 border-royal-600 bg-royal-50/60 px-5 py-3.5 text-sm font-semibold text-royal-700">
                Codactics Form
              </th>
              <th className="px-5 py-3.5 text-sm font-medium text-royal-500">
                In general
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.capability} className="border-b border-royal-50 last:border-0">
                <td className="px-5 py-4 text-sm font-medium text-royal-900">
                  {row.capability}
                </td>
                <td className="border-l-2 border-royal-600 bg-royal-50/60 px-5 py-4">
                  <VerdictCell verdict={row.codactis.verdict} note={row.codactis.note} />
                </td>
                <td className="px-5 py-4">
                  <VerdictCell verdict={row.others.verdict} note={row.others.note} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
