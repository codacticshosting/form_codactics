"use client";

import { useRef, useState } from "react";
import { Plus, X, Image as ImageIcon } from "lucide-react";
import type { RankingItem } from "@/types/form-builder";
import { FORM_IMAGE_ACCEPT } from "@/lib/image-types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function RankingItemEditor({
  items,
  onChange,
}: {
  items: RankingItem[];
  onChange: (items: RankingItem[]) => void;
}) {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Keyed by item id — several rows could in principle be uploading at
  // once, so this can't just be one shared value.
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  function updateItem(id: string, updates: Partial<RankingItem>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }

  function clearRowState(id: string) {
    setProgress((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function handleImageUpload(id: string, file: File) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    if (file.size > MAX_IMAGE_BYTES) {
      setErrors((prev) => ({
        ...prev,
        [id]: "File is bigger than 5MB and can't be uploaded.",
      }));
      return;
    }

    const reader = new FileReader();
    setProgress((prev) => ({ ...prev, [id]: 0 }));
    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress((prev) => ({ ...prev, [id]: Math.round((e.loaded / e.total) * 100) }));
      }
    };
    reader.onload = () => {
      updateItem(id, { imageDataUrl: reader.result as string });
      clearRowState(id);
    };
    reader.onerror = () => {
      setErrors((prev) => ({ ...prev, [id]: "Couldn't read that file. Please try again." }));
      clearRowState(id);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.id} className="flex flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRefs.current[item.id]?.click();
              }}
              className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-royal-300 bg-royal-50/40 text-royal-400 hover:bg-royal-50"
              aria-label="Add image (optional)"
              title="Add image (optional, up to 5MB)"
            >
              {item.imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageDataUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageIcon size={14} />
              )}
            </button>
            <input
              ref={(el) => {
                fileInputRefs.current[item.id] = el;
              }}
              type="file"
              accept={FORM_IMAGE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(item.id, file);
                e.target.value = "";
              }}
            />
            <input
              value={item.label}
              onChange={(e) => updateItem(item.id, { label: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              placeholder="Text (optional if using an image)"
              className="min-w-0 flex-1 rounded-md border border-royal-200 bg-white px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
            />
            {item.imageDataUrl && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  updateItem(item.id, { imageDataUrl: undefined });
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
                onChange(items.filter((i) => i.id !== item.id));
              }}
              className="shrink-0 rounded-md p-1.5 text-royal-400 hover:bg-royal-100 hover:text-royal-700"
              aria-label="Remove item"
            >
              <X size={14} />
            </button>
          </div>
          {progress[item.id] !== undefined && (
            <div className="ml-11 h-1.5 w-40 overflow-hidden rounded-full bg-royal-100">
              <div
                className="h-full rounded-full bg-royal-500 transition-all"
                style={{ width: `${progress[item.id]}%` }}
              />
            </div>
          )}
          {errors[item.id] && (
            <p className="ml-11 text-[11px] font-medium text-red-600">{errors[item.id]}</p>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onChange([...items, { id: crypto.randomUUID(), label: `Item ${items.length + 1}` }]);
        }}
        className="flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-xs font-medium text-royal-600 hover:bg-royal-100"
      >
        <Plus size={14} />
        Add item
      </button>
    </div>
  );
}
