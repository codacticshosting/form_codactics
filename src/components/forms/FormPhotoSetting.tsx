"use client";

import { useState, useTransition } from "react";
import { setFormCompressPhotos } from "@/lib/form-actions";
import { PhotoOptimizationOption } from "@/components/forms/PhotoOptimizationOption";

// The Settings page's photo-optimization checkbox — saves as soon as it's
// clicked, and only affects photos uploaded from then on.
export function FormPhotoSetting({
  formId,
  initialCompressPhotos,
  storage,
  freeBytes,
}: {
  formId: string;
  initialCompressPhotos: boolean;
  storage: "local" | "google";
  freeBytes: number | null;
}) {
  const [checked, setChecked] = useState(initialCompressPhotos);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"saved" | "error" | null>(null);

  function handleChange(next: boolean) {
    const previous = checked;
    setChecked(next);
    setStatus(null);
    startTransition(async () => {
      const result = await setFormCompressPhotos(formId, next);
      if (result.ok) {
        setStatus("saved");
        setTimeout(() => setStatus(null), 2000);
      } else {
        setChecked(previous);
        setStatus("error");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <PhotoOptimizationOption
        checked={checked}
        onChange={handleChange}
        storage={storage}
        freeBytes={freeBytes}
        disabled={isPending}
      />
      <p className="text-xs text-royal-400">
        Changes apply to photos uploaded from now on — photos already received stay as they are.
        {status === "saved" && <span className="ml-2 font-medium text-green-600">Saved</span>}
        {status === "error" && (
          <span className="ml-2 font-medium text-red-600">Couldn&apos;t save — please try again.</span>
        )}
      </p>
    </div>
  );
}
