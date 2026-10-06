"use client";

import { useRef, useState } from "react";
import { Plus, X, Image as ImageIcon } from "lucide-react";
import type { DropdownOption } from "@/types/form-builder";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function DropdownOptionEditor({
  options,
  onChange,
}: {
  options: DropdownOption[];
  onChange: (options: DropdownOption[]) => void;
}) {
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  // Keyed by option index — several rows could in principle be uploading
  // at once, so this can't just be one shared value.
  const [progress, setProgress] = useState<Record<number, number>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});

  function updateOption(i: number, updates: Partial<DropdownOption>) {
    onChange(options.map((o, idx) => (idx === i ? { ...o, ...updates } : o)));
  }

  function clearRowState(i: number) {
    setProgress((prev) => {
      const next = { ...prev };
      delete next[i];
      return next;
    });
  }

  function handleImageUpload(i: number, file: File) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[i];
      return next;
    });

    if (file.size > MAX_IMAGE_BYTES) {
      setErrors((prev) => ({
        ...prev,
        [i]: "File is bigger than 5MB and can't be uploaded.",
      }));
      return;
    }

    const reader = new FileReader();
    setProgress((prev) => ({ ...prev, [i]: 0 }));
    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress((prev) => ({ ...prev, [i]: Math.round((e.loaded / e.total) * 100) }));
      }
    };
    reader.onload = () => {
      updateOption(i, { imageDataUrl: reader.result as string });
      clearRowState(i);
    };
    reader.onerror = () => {
      setErrors((prev) => ({ ...prev, [i]: "Couldn't read that file. Please try again." }));
      clearRowState(i);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex flex-col gap-2">
      {options.map((option, i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRefs.current[i]?.click();
              }}
              className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-royal-300 bg-royal-50/40 text-royal-400 hover:bg-royal-50"
              aria-label="Add image (optional)"
              title="Add image (optional, up to 5MB)"
            >
              {option.imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={option.imageDataUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageIcon size={14} />
              )}
            </button>
            <input
              ref={(el) => {
                fileInputRefs.current[i] = el;
              }}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(i, file);
                e.target.value = "";
              }}
            />
            <input
              value={option.label}
              onChange={(e) => updateOption(i, { label: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 rounded-md border border-royal-200 bg-white px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
            />
            {option.imageDataUrl && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  updateOption(i, { imageDataUrl: undefined });
                }}
                className="shrink-0 text-[10px] font-medium text-royal-400 hover:text-red-600"
              >
                Remove image
              </button>
            )}
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
          {progress[i] !== undefined && (
            <div className="ml-11 h-1.5 w-40 overflow-hidden rounded-full bg-royal-100">
              <div
                className="h-full rounded-full bg-royal-500 transition-all"
                style={{ width: `${progress[i]}%` }}
              />
            </div>
          )}
          {errors[i] && (
            <p className="ml-11 text-[11px] font-medium text-red-600">{errors[i]}</p>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onChange([...options, { label: `Option ${options.length + 1}` }]);
        }}
        className="flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-xs font-medium text-royal-600 hover:bg-royal-100"
      >
        <Plus size={14} />
        Add option
      </button>
    </div>
  );
}
