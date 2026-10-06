"use client";

import { useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function SingleImageUploader({
  imageDataUrl,
  onChange,
  label = "Upload image",
}: {
  imageDataUrl: string | undefined;
  onChange: (dataUrl: string | undefined) => void;
  label?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleUpload(file: File) {
    setError(null);
    if (file.size > MAX_IMAGE_BYTES) {
      setError("File is bigger than 5MB and can't be uploaded.");
      return;
    }
    const reader = new FileReader();
    setProgress(0);
    reader.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    reader.onload = () => {
      onChange(reader.result as string);
      setProgress(null);
    };
    reader.onerror = () => {
      setError("Couldn't read that file. Please try again.");
      setProgress(null);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-royal-300 bg-white text-royal-400 hover:bg-royal-50"
          aria-label={label}
        >
          {imageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageDataUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon size={18} />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
        />
        <span className="text-xs text-royal-500">
          {imageDataUrl ? "Click the thumbnail to replace" : `${label} (up to 5MB)`}
        </span>
        {imageDataUrl && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-[10px] font-medium text-royal-400 hover:text-red-600"
          >
            Remove
          </button>
        )}
      </div>
      {progress !== null && (
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-royal-100">
          <div
            className="h-full rounded-full bg-royal-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {error && <p className="text-[11px] font-medium text-red-600">{error}</p>}
    </div>
  );
}
