"use client";

import { FIELD_TYPE_DEFS, type FieldTypeDef } from "@/lib/field-types";
import { PaletteItem } from "./PaletteItem";

export function FieldPalette({
  onAdd,
}: {
  onAdd: (def: FieldTypeDef) => void;
}) {
  return (
    <div className="rounded-xl border border-royal-100 bg-royal-50/60 p-4 md:sticky md:top-24 md:max-h-[calc(100vh-12rem)] md:overflow-y-auto">
      <h2 className="mb-1 text-sm font-semibold text-royal-950">
        Add a field
      </h2>
      <p className="mb-4 text-xs text-royal-500">
        Drag onto the form, or click to add.
      </p>
      <div className="flex flex-col gap-2">
        {FIELD_TYPE_DEFS.map((def) => (
          <PaletteItem key={def.type} def={def} onAdd={onAdd} />
        ))}
      </div>
    </div>
  );
}
