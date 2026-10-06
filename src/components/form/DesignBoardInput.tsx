"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Eraser, Undo2, Redo2, Plus, X, Move, Pencil, Wand2 } from "lucide-react";
import type { FormField } from "@/types/form-builder";

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// Resolution the final flattened answer is rendered at — independent of
// however big the on-screen board happens to be, so the recorded image
// stays crisp regardless of display size.
const EXPORT_WIDTH = 1200;

const PRESET_COLORS = [
  "#14183a",
  "#dc2626",
  "#f97316",
  "#eab308",
  "#16a34a",
  "#2563eb",
  "#7c3aed",
  "#db2777",
];

const PEN_SIZES = [
  { label: "Thin", value: 1.5 },
  { label: "Medium", value: 2.5 },
  { label: "Thick", value: 5 },
];

const ERASER_SIZE_MULTIPLIER = 6;

interface PlacedImage {
  id: string;
  // Currently displayed/exported image — either originalDataUrl, or
  // bgRemovedDataUrl once background removal has been applied.
  dataUrl: string;
  originalDataUrl: string;
  // Cached once computed, so toggling background removal back on doesn't
  // redo the pixel work.
  bgRemovedDataUrl?: string;
  bgRemoved: boolean;
  // The upload's own natural width/height ratio — resizing keeps this
  // fixed rather than letting the image distort.
  aspect: number;
  // Percentages of the board's displayed box — resolution independent, and
  // trivially convertible into the export canvas's pixel space.
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Makes the background transparent by sampling the image's four corner
// pixels (averaged) as the presumed background color and clearing every
// pixel within a tolerance of it. Works well for logos/product shots on a
// flat background (like the corners actually being that background) —
// not true subject segmentation, so it won't cleanly cut a person out of
// a busy photo.
async function computeBackgroundRemoved(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;

  function pixelAt(x: number, y: number) {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  }
  const corners = [
    pixelAt(0, 0),
    pixelAt(width - 1, 0),
    pixelAt(0, height - 1),
    pixelAt(width - 1, height - 1),
  ];
  const bg = [0, 1, 2].map(
    (channel) => corners.reduce((sum, c) => sum + c[channel], 0) / corners.length,
  );

  // RGB distance tolerance — generous enough to catch anti-aliased edges
  // and slight JPEG noise around a flat background, conservative enough
  // not to eat into a similarly-light subject.
  const tolerance = 42;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - bg[0];
    const dg = data[i + 1] - bg[1];
    const db = data[i + 2] - bg[2];
    if (Math.sqrt(dr * dr + dg * dg + db * db) < tolerance) {
      data[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

export function DesignBoardInput({
  field,
}: {
  field: Extract<FormField, { type: "design-board" }>;
}) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requiredAnchorRef = useRef<HTMLInputElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);

  const drawing = useRef(false);
  const strokeDirtyRef = useRef(false);
  const historyRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef(-1);
  const historyInitializedRef = useRef(false);

  const [aspectRatio, setAspectRatio] = useState(4 / 3);
  // Only ever read inside flatten() below, never rendered — a ref avoids
  // both an unnecessary re-render on load and a synchronous setState call
  // in the effect's early-return branch.
  const baseImageElRef = useRef<HTMLImageElement | null>(null);
  const [images, setImages] = useState<PlacedImage[]>([]);
  const [mode, setMode] = useState<"move" | "draw">("move");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [penSize, setPenSize] = useState(PEN_SIZES[1].value);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [removingBgIds, setRemovingBgIds] = useState<Set<string>>(new Set());
  const [hasInteracted, setHasInteracted] = useState(false);
  const [flattenedDataUrl, setFlattenedDataUrl] = useState<string | null>(null);

  // Load the admin's template image once (or whenever it changes) to read
  // its natural aspect ratio — the board's displayed box, and the export
  // canvas, both follow it so nothing gets stretched or letterboxed.
  useEffect(() => {
    if (!field.baseImageDataUrl) {
      baseImageElRef.current = null;
      return;
    }
    let cancelled = false;
    loadImage(field.baseImageDataUrl).then((img) => {
      if (cancelled) return;
      setAspectRatio(img.naturalWidth / img.naturalHeight || 4 / 3);
      baseImageElRef.current = img;
    });
    return () => {
      cancelled = true;
    };
  }, [field.baseImageDataUrl]);

  function refreshUndoRedoState() {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }

  const attachCanvas = useCallback((node: HTMLCanvasElement | null) => {
    resizeObserverRef.current?.disconnect();
    canvasRef.current = node;
    if (!node) return;

    const resize = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const ratio = window.devicePixelRatio || 1;
      node.width = rect.width * ratio;
      node.height = rect.height * ratio;
      const ctx = node.getContext("2d");
      if (ctx) {
        ctx.scale(ratio, ratio);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (!historyInitializedRef.current) {
          historyInitializedRef.current = true;
          historyRef.current = [ctx.getImageData(0, 0, node.width, node.height)];
          historyIndexRef.current = 0;
          refreshUndoRedoState();
        }
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resizeObserverRef.current = observer;
  }, []);

  const flatten = useCallback(async () => {
    const exportHeight = Math.round(EXPORT_WIDTH / aspectRatio);
    let exportCanvas = exportCanvasRef.current;
    if (!exportCanvas) {
      exportCanvas = document.createElement("canvas");
      exportCanvasRef.current = exportCanvas;
    }
    exportCanvas.width = EXPORT_WIDTH;
    exportCanvas.height = exportHeight;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, EXPORT_WIDTH, exportHeight);

    if (baseImageElRef.current) {
      // The export box's aspect ratio was derived from this same image,
      // so a direct stretch-to-fill never distorts it.
      ctx.drawImage(baseImageElRef.current, 0, 0, EXPORT_WIDTH, exportHeight);
    }

    for (const layer of images) {
      try {
        const img = await loadImage(layer.dataUrl);
        ctx.drawImage(
          img,
          (layer.xPct / 100) * EXPORT_WIDTH,
          (layer.yPct / 100) * exportHeight,
          (layer.widthPct / 100) * EXPORT_WIDTH,
          (layer.heightPct / 100) * exportHeight,
        );
      } catch {
        // A single bad image shouldn't blank the whole flattened answer.
      }
    }

    if (canvasRef.current) {
      ctx.drawImage(canvasRef.current, 0, 0, EXPORT_WIDTH, exportHeight);
    }

    setFlattenedDataUrl(exportCanvas.toDataURL("image/png"));
  }, [aspectRatio, images]);

  useEffect(() => {
    hiddenRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [flattenedDataUrl]);

  useEffect(() => {
    const el = requiredAnchorRef.current;
    if (!el) return;
    el.setCustomValidity(
      field.required && !hasInteracted
        ? "Please add a photo or draw something before submitting."
        : "",
    );
  }, [field.required, hasInteracted]);

  function handleAddImageClick() {
    if (images.length >= MAX_IMAGES) return;
    fileInputRef.current?.click();
  }

  function handleAddImage(file: File) {
    if (images.length >= MAX_IMAGES) return;
    setUploadError(null);
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError("File is bigger than 5MB and can't be uploaded.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        const probe = await loadImage(dataUrl);
        const naturalAspect = probe.naturalWidth / probe.naturalHeight || 1;
        const widthPct = 28;
        const heightPct = Math.min(90, (widthPct * aspectRatio) / naturalAspect);
        const offset = images.length * 4;
        setImages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            dataUrl,
            originalDataUrl: dataUrl,
            bgRemoved: false,
            aspect: naturalAspect,
            xPct: Math.min(60, 8 + offset),
            yPct: Math.min(60, 8 + offset),
            widthPct,
            heightPct,
          },
        ]);
        setHasInteracted(true);
        await flatten();
      } catch {
        setUploadError("Couldn't read that file. Please try again.");
      }
    };
    reader.onerror = () => setUploadError("Couldn't read that file. Please try again.");
    reader.readAsDataURL(file);
  }

  function updateImagePosition(id: string, xPct: number, yPct: number) {
    setImages((prev) => prev.map((img) => (img.id === id ? { ...img, xPct, yPct } : img)));
  }

  function updateImageSize(id: string, widthPct: number, heightPct: number) {
    setImages((prev) => prev.map((img) => (img.id === id ? { ...img, widthPct, heightPct } : img)));
  }

  async function removeImage(id: string) {
    setImages((prev) => prev.filter((img) => img.id !== id));
    await flatten();
  }

  async function toggleBackgroundRemoval(id: string) {
    const layer = images.find((img) => img.id === id);
    if (!layer) return;

    if (layer.bgRemoved) {
      setImages((prev) =>
        prev.map((img) =>
          img.id === id ? { ...img, dataUrl: img.originalDataUrl, bgRemoved: false } : img,
        ),
      );
      await flatten();
      return;
    }

    setRemovingBgIds((prev) => new Set(prev).add(id));
    try {
      const transparentUrl =
        layer.bgRemovedDataUrl ?? (await computeBackgroundRemoved(layer.originalDataUrl));
      setImages((prev) =>
        prev.map((img) =>
          img.id === id
            ? { ...img, dataUrl: transparentUrl, bgRemovedDataUrl: transparentUrl, bgRemoved: true }
            : img,
        ),
      );
      await flatten();
    } finally {
      setRemovingBgIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    strokeDirtyRef.current = false;
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = color;
    ctx.lineWidth = tool === "eraser" ? penSize * ERASER_SIZE_MULTIPLIER : penSize;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    strokeDirtyRef.current = true;
  }

  async function handlePointerUp() {
    if (!drawing.current) return;
    drawing.current = false;
    if (strokeDirtyRef.current) {
      commitHistory();
      setHasInteracted(true);
      await flatten();
    }
  }

  function commitHistory() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const truncated = historyRef.current.slice(0, historyIndexRef.current + 1);
    truncated.push(snapshot);
    historyRef.current = truncated;
    historyIndexRef.current = truncated.length - 1;
    refreshUndoRedoState();
  }

  async function restoreSnapshot(index: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const snapshot = historyRef.current[index];
    if (!canvas || !ctx || !snapshot) return;
    ctx.putImageData(snapshot, 0, 0);
    historyIndexRef.current = index;
    refreshUndoRedoState();
    await flatten();
  }

  function undo() {
    if (historyIndexRef.current <= 0) return;
    void restoreSnapshot(historyIndexRef.current - 1);
  }

  function redo() {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    void restoreSnapshot(historyIndexRef.current + 1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>) {
    if (!e.ctrlKey && !e.metaKey) return;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (key === "y" || (key === "z" && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  }

  async function handleClearDrawing() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      commitHistory();
      await flatten();
    }
  }

  useEffect(() => {
    const formEl = boardRef.current?.closest("form");
    if (!formEl) return;
    const handleReset = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        historyRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
        historyIndexRef.current = 0;
        refreshUndoRedoState();
      }
      setImages([]);
      setTool("pen");
      setMode("move");
      setHasInteracted(false);
      setFlattenedDataUrl(null);
    };
    formEl.addEventListener("reset", handleReset);
    return () => formEl.removeEventListener("reset", handleReset);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex flex-wrap items-center gap-3 rounded-md border border-royal-100 bg-royal-50/40 px-3 py-2"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 rounded-md border border-royal-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setMode("move")}
            title="Move photos"
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
              mode === "move" ? "bg-royal-600 text-white" : "text-royal-600 hover:bg-royal-50"
            }`}
          >
            <Move size={12} />
            Move
          </button>
          <button
            type="button"
            onClick={() => setMode("draw")}
            title="Draw"
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
              mode === "draw" ? "bg-royal-600 text-white" : "text-royal-600 hover:bg-royal-50"
            }`}
          >
            <Pencil size={12} />
            Draw
          </button>
        </div>

        <button
          type="button"
          onClick={handleAddImageClick}
          disabled={images.length >= MAX_IMAGES}
          className="flex items-center gap-1 rounded-md border border-dashed border-royal-300 bg-white px-2 py-1 text-xs font-medium text-royal-600 hover:bg-royal-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={12} />
          Add photo ({images.length}/{MAX_IMAGES})
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleAddImage(file);
            e.target.value = "";
          }}
        />

        {mode === "draw" && (
          <>
            <div className="flex items-center gap-1.5 border-l border-royal-200 pl-3">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setColor(c);
                    setTool("pen");
                  }}
                  aria-label={`Use ${c} pen color`}
                  className={`h-6 w-6 shrink-0 rounded-full ring-offset-2 transition-shadow ${
                    tool === "pen" && color === c ? "ring-2 ring-royal-500" : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <label
                className="relative flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-dashed border-royal-300 bg-white text-[10px] text-royal-400"
                title="Custom color"
              >
                +
                <input
                  type="color"
                  value={color}
                  onChange={(e) => {
                    setColor(e.target.value);
                    setTool("pen");
                  }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
            </div>

            <div className="flex items-center gap-1 border-l border-royal-200 pl-3">
              {PEN_SIZES.map((size) => (
                <button
                  key={size.label}
                  type="button"
                  onClick={() => setPenSize(size.value)}
                  title={size.label}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                    penSize === size.value
                      ? "bg-royal-600 text-white"
                      : "bg-white text-royal-500 hover:bg-royal-100"
                  }`}
                >
                  <span
                    className="rounded-full bg-current"
                    style={{ width: size.value + 2, height: size.value + 2 }}
                  />
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 border-l border-royal-200 pl-3">
              <button
                type="button"
                onClick={() => setTool((t) => (t === "eraser" ? "pen" : "eraser"))}
                title="Eraser"
                aria-pressed={tool === "eraser"}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                  tool === "eraser"
                    ? "bg-royal-600 text-white"
                    : "bg-white text-royal-500 hover:bg-royal-100"
                }`}
              >
                <Eraser size={13} />
              </button>
            </div>

            <div className="flex items-center gap-1 border-l border-royal-200 pl-3">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-royal-500 hover:bg-royal-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white"
              >
                <Undo2 size={13} />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                title="Redo (Ctrl+Y)"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-royal-500 hover:bg-royal-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white"
              >
                <Redo2 size={13} />
              </button>
            </div>

            <button
              type="button"
              onClick={handleClearDrawing}
              className="ml-auto text-xs font-medium text-royal-500 hover:underline"
            >
              Clear drawing
            </button>
          </>
        )}
      </div>

      {uploadError && (
        <p className="text-[11px] font-medium text-red-600">{uploadError}</p>
      )}

      <div
        ref={boardRef}
        className="relative w-full overflow-hidden rounded-md border border-royal-200 bg-royal-50/60"
        style={{ aspectRatio: `${aspectRatio}` }}
      >
        {field.baseImageDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={field.baseImageDataUrl}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-royal-400">
            No template image set
          </div>
        )}

        {images.map((img) => (
          <PlacedImageLayer
            key={img.id}
            image={img}
            interactive={mode === "move"}
            boardRef={boardRef}
            boardAspectRatio={aspectRatio}
            removingBackground={removingBgIds.has(img.id)}
            onMove={(xPct, yPct) => updateImagePosition(img.id, xPct, yPct)}
            onResize={(widthPct, heightPct) => updateImageSize(img.id, widthPct, heightPct)}
            onCommit={() => void flatten()}
            onRemove={() => void removeImage(img.id)}
            onToggleBackground={() => void toggleBackgroundRemoval(img.id)}
          />
        ))}

        <canvas
          ref={attachCanvas}
          tabIndex={0}
          onPointerDown={mode === "draw" ? handlePointerDown : undefined}
          onPointerMove={mode === "draw" ? handlePointerMove : undefined}
          onPointerUp={mode === "draw" ? handlePointerUp : undefined}
          onPointerLeave={mode === "draw" ? handlePointerUp : undefined}
          onKeyDown={handleKeyDown}
          className={`absolute inset-0 h-full w-full touch-none outline-none ${
            mode === "draw" ? "" : "pointer-events-none"
          }`}
        />
      </div>

      <input ref={hiddenRef} type="hidden" name={field.id} value={flattenedDataUrl ?? ""} readOnly />
      <input
        ref={requiredAnchorRef}
        type="text"
        readOnly
        value={hasInteracted ? "ok" : ""}
        aria-hidden="true"
        tabIndex={-1}
        className="absolute h-0 w-0 opacity-0"
      />
    </div>
  );
}

function PlacedImageLayer({
  image,
  interactive,
  boardRef,
  boardAspectRatio,
  removingBackground,
  onMove,
  onResize,
  onCommit,
  onRemove,
  onToggleBackground,
}: {
  image: PlacedImage;
  interactive: boolean;
  boardRef: RefObject<HTMLDivElement | null>;
  boardAspectRatio: number;
  removingBackground: boolean;
  onMove: (xPct: number, yPct: number) => void;
  onResize: (widthPct: number, heightPct: number) => void;
  onCommit: () => void;
  onRemove: () => void;
  onToggleBackground: () => void;
}) {
  const dragState = useRef<{
    startX: number;
    startY: number;
    originXPct: number;
    originYPct: number;
  } | null>(null);
  const resizeState = useRef<{ startX: number; originWidthPct: number } | null>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!interactive) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      originXPct: image.xPct,
      originYPct: image.yPct,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const dxPct = ((e.clientX - dragState.current.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - dragState.current.startY) / rect.height) * 100;
    const maxX = Math.max(100 - image.widthPct, 0);
    const maxY = Math.max(100 - image.heightPct, 0);
    const nextX = Math.min(Math.max(dragState.current.originXPct + dxPct, 0), maxX);
    const nextY = Math.min(Math.max(dragState.current.originYPct + dyPct, 0), maxY);
    onMove(nextX, nextY);
  }

  function handlePointerUp() {
    if (!dragState.current) return;
    dragState.current = null;
    onCommit();
  }

  function handleResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!interactive) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeState.current = { startX: e.clientX, originWidthPct: image.widthPct };
  }

  function handleResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeState.current || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const dxPct = ((e.clientX - resizeState.current.startX) / rect.width) * 100;
    const minWidthPct = 6;
    const maxWidthPct = Math.max(100 - image.xPct, minWidthPct);
    const nextWidthPct = Math.min(
      Math.max(resizeState.current.originWidthPct + dxPct, minWidthPct),
      maxWidthPct,
    );
    // Keeps the upload's own aspect ratio rather than letting it stretch —
    // derived the same way the initial drop size is.
    const nextHeightPct = Math.min(
      (nextWidthPct * boardAspectRatio) / image.aspect,
      Math.max(100 - image.yPct, 0),
    );
    onResize(nextWidthPct, nextHeightPct);
  }

  function handleResizePointerUp() {
    if (!resizeState.current) return;
    resizeState.current = null;
    onCommit();
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{
        position: "absolute",
        left: `${image.xPct}%`,
        top: `${image.yPct}%`,
        width: `${image.widthPct}%`,
        height: `${image.heightPct}%`,
        touchAction: "none",
      }}
      className={interactive ? "cursor-grab active:cursor-grabbing" : ""}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.dataUrl}
        alt=""
        draggable={false}
        className="h-full w-full select-none rounded object-cover shadow-md ring-2 ring-white"
      />
      {interactive && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-royal-500 shadow ring-1 ring-royal-200 hover:text-red-600"
            aria-label="Remove image"
          >
            <X size={12} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleBackground();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={removingBackground}
            title={image.bgRemoved ? "Restore background" : "Remove background"}
            aria-label={image.bgRemoved ? "Restore background" : "Remove background"}
            className={`absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full shadow ring-1 disabled:cursor-wait disabled:opacity-60 ${
              image.bgRemoved
                ? "bg-royal-600 text-white ring-royal-600"
                : "bg-white text-royal-500 ring-royal-200 hover:text-royal-700"
            }`}
          >
            {removingBackground ? (
              <span className="h-2 w-2 animate-spin rounded-full border border-current border-t-transparent" />
            ) : (
              <Wand2 size={11} />
            )}
          </button>
          <div
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            onPointerLeave={handleResizePointerUp}
            style={{ touchAction: "none" }}
            role="button"
            tabIndex={-1}
            aria-label="Resize image"
            className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-royal-500 shadow"
          />
        </>
      )}
    </div>
  );
}
