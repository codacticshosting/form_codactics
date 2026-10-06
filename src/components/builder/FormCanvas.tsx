"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { LayoutList } from "lucide-react";
import type { FormField } from "@/types/form-builder";
import { FieldBlock } from "./FieldBlock";

export function FormCanvas({
  fields,
  selectedId,
  onSelect,
  onChange,
  onDelete,
  insertionTargetId,
  accessUsernames,
}: {
  fields: FormField[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (field: FormField) => void;
  onDelete: (id: string) => void;
  insertionTargetId: string | null;
  accessUsernames: string[];
}) {
  const { setNodeRef: setEmptyRef, isOver: isOverEmpty } = useDroppable({
    id: "canvas",
    disabled: fields.length > 0,
  });
  const { setNodeRef: setEndRef } = useDroppable({ id: "canvas-end" });

  if (fields.length === 0) {
    return (
      <div
        ref={setEmptyRef}
        className={`flex w-full min-h-[400px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-20 text-center transition-colors ${
          isOverEmpty
            ? "border-royal-400 bg-royal-100/50 text-royal-500"
            : "border-royal-200 text-royal-400"
        }`}
      >
        <LayoutList size={28} />
        <p className="text-sm">
          Drag a field here, or click one from the panel to get started
        </p>
      </div>
    );
  }

  return (
    <div className="grid w-full min-h-[400px] grid-cols-1 gap-3 p-1">
      <SortableContext
        items={fields.map((f) => f.id)}
        strategy={verticalListSortingStrategy}
      >
        {fields.map((field) => (
          <div key={field.id} className="grid w-full grid-cols-1 gap-3">
            {insertionTargetId === field.id && <DropIndicator />}
            <FieldBlock
              field={field}
              allFields={fields}
              selected={field.id === selectedId}
              onSelect={() => onSelect(field.id)}
              onChange={onChange}
              onDelete={() => onDelete(field.id)}
              accessUsernames={accessUsernames}
            />
          </div>
        ))}
      </SortableContext>

      <div ref={setEndRef} className="flex min-h-[16px] flex-col">
        {insertionTargetId === "canvas-end" && <DropIndicator />}
      </div>
    </div>
  );
}

function DropIndicator() {
  return (
    <div className="h-14 shrink-0 animate-pulse rounded-xl border-2 border-dashed border-royal-400 bg-royal-100/60" />
  );
}
