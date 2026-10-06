"use client";

import { Plus, X } from "lucide-react";

export function OptionListEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((option, i) => (
        <div key={i} className="flex min-w-0 items-center gap-2">
          <input
            value={option}
            onChange={(e) => {
              const next = [...options];
              next[i] = e.target.value;
              onChange(next);
            }}
            onClick={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 rounded-md border border-royal-200 bg-white px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(options.filter((_, j) => j !== i));
            }}
            className="shrink-0 rounded-md p-1.5 text-royal-400 hover:bg-royal-100 hover:text-royal-700"
            aria-label="Remove option"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onChange([...options, `Option ${options.length + 1}`]);
        }}
        className="flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-xs font-medium text-royal-600 hover:bg-royal-100"
      >
        <Plus size={14} />
        Add option
      </button>
    </div>
  );
}
