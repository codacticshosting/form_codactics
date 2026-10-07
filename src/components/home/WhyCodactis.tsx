import { Trophy, KeyRound, SlidersHorizontal, FolderOpen, Infinity } from "lucide-react";
import { ScrollReveal } from "./ScrollReveal";

const POINTS = [
  {
    icon: Trophy,
    title: "Tournament-first",
    description: "Player lists, rankings, and competition-specific registration are built in.",
  },
  {
    icon: KeyRound,
    title: "Your own credentials",
    description: "Participants register with a code you set — no Google or other platform account needed.",
  },
  {
    icon: SlidersHorizontal,
    title: "Flexible access limits",
    description: "Control how many times every credential can be used, and reset it anytime.",
  },
  {
    icon: FolderOpen,
    title: "Your data, your choice",
    description: "Use Codactics storage, or write straight to your own Google Drive.",
  },
  {
    icon: Infinity,
    title: "No submission cap",
    description: "Your event can grow without your form bill growing with it.",
  },
];

export function WhyCodactis() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-royal-950">
          Why organizers choose Codactics
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {POINTS.map((point, i) => {
          const Icon = point.icon;
          return (
            <ScrollReveal key={point.title} delay={i * 70} className="h-full">
              <div className="flex h-full flex-col gap-2 rounded-xl border border-royal-100 bg-white p-4 shadow-sm">
                <Icon size={18} className="text-royal-600" />
                <h3 className="text-xs font-semibold text-royal-950">
                  {point.title}
                </h3>
                <p className="text-xs leading-relaxed text-royal-500">
                  {point.description}
                </p>
              </div>
            </ScrollReveal>
          );
        })}
      </div>
    </div>
  );
}
