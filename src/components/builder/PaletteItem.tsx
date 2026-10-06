"use client";

import { useDraggable } from "@dnd-kit/core";
import type { FieldTypeDef } from "@/lib/field-types";

export function PaletteItem({
  def,
  onAdd,
}: {
  def: FieldTypeDef;
  onAdd: (def: FieldTypeDef) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${def.type}`,
    data: { source: "palette", type: def.type },
  });
  const Icon = def.icon;

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onAdd(def)}
      className={`flex w-full items-start gap-3 rounded-lg border border-royal-100 bg-white p-3 text-left transition-colors hover:border-royal-300 hover:bg-royal-50 ${
        isDragging ? "opacity-40" : ""
      }`}
      {...listeners}
      {...attributes}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-royal-100 text-royal-600">
        <Icon size={16} />
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-medium text-royal-950">{def.label}</span>
        <span className="text-xs text-royal-500">{def.description}</span>
      </span>
    </button>
  );
}
