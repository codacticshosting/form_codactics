"use client";

import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, X } from "lucide-react";
import {
  computeBannerRect,
  BANNER_ASPECT_RATIO,
  BANNER_MIN_ZOOM,
  BANNER_MAX_ZOOM,
  type BannerImage,
} from "@/types/theme";
import { useElementWidth } from "@/hooks/useElementWidth";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Used both as the interactive editor (DesignStep, with onChange) and the
// read-only display (HeaderPreview, no onChange) — the exact same "cover,
// then zoom, then pan" math either way, so what the admin sets up here is
// pixel-for-pixel what respondents actually see.
export function BannerImageFrame({
  banner,
  onChange,
}: {
  banner: BannerImage;
  onChange?: (banner: BannerImage) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useElementWidth(containerRef);
  const containerHeight = containerWidth / BANNER_ASPECT_RATIO;
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const dragState = useRef<{
    pointerX: number;
    pointerY: number;
    origPanX: number;
    origPanY: number;
  } | null>(null);

  const editable = !!onChange;

  useEffect(() => {
    // No need to clear naturalSize here — the component renders nothing
    // (see the early return below) while dataUrl is unset, and the next
    // time it's set this same effect fetches a fresh size before render
    // ever reads the stale one.
    if (!banner.dataUrl) return;
    let cancelled = false;
    loadImage(banner.dataUrl).then((img) => {
      if (!cancelled) setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    });
    return () => {
      cancelled = true;
    };
  }, [banner.dataUrl]);

  if (!banner.dataUrl) return null;

  const rect = naturalSize
    ? computeBannerRect(containerWidth, containerHeight, naturalSize.width, naturalSize.height, banner)
    : null;

  function handlePointerDown(e: React.PointerEvent) {
    if (!editable) return;
    e.preventDefault();
    dragState.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      origPanX: banner.panX,
      origPanY: banner.panY,
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function handlePointerMove(e: PointerEvent) {
    const start = dragState.current;
    if (!start || !naturalSize || !onChange) return;
    const current = computeBannerRect(
      containerWidth,
      containerHeight,
      naturalSize.width,
      naturalSize.height,
      banner,
    );
    const slackX = containerWidth - current.width; // <= 0
    const slackY = containerHeight - current.height; // <= 0
    const dx = e.clientX - start.pointerX;
    const dy = e.clientY - start.pointerY;
    const nextPanX = slackX === 0 ? 0.5 : clamp(start.origPanX + -dx / slackX, 0, 1);
    const nextPanY = slackY === 0 ? 0.5 : clamp(start.origPanY + -dy / slackY, 0, 1);
    onChange({ ...banner, panX: nextPanX, panY: nextPanY });
  }

  function handlePointerUp() {
    dragState.current = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      className={`relative w-full overflow-hidden rounded-xl border border-royal-200 ${
        editable ? "cursor-grab touch-none select-none active:cursor-grabbing" : ""
      }`}
      style={{ aspectRatio: `${BANNER_ASPECT_RATIO} / 1` }}
    >
      {rect && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={banner.dataUrl}
          alt=""
          draggable={false}
          className="absolute max-w-none select-none"
          style={{ width: rect.width, height: rect.height, left: rect.left, top: rect.top }}
        />
      )}

      {editable && onChange && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ ...banner, dataUrl: null });
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Remove banner"
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <X size={14} />
          </button>

          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/50 px-3 py-1.5"
          >
            <ZoomOut size={13} className="shrink-0 text-white" />
            <input
              type="range"
              min={BANNER_MIN_ZOOM}
              max={BANNER_MAX_ZOOM}
              step={0.05}
              value={banner.zoom}
              onChange={(e) => onChange({ ...banner, zoom: Number(e.target.value) })}
              className="w-32 accent-white"
            />
            <ZoomIn size={13} className="shrink-0 text-white" />
          </div>
        </>
      )}
    </div>
  );
}
