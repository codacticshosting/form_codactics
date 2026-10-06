"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Undo2, Redo2 } from "lucide-react";

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

// Eraser needs a much bigger footprint than the thinnest pen to actually
// feel like an eraser — scaled off the same Thin/Medium/Thick picker
// rather than giving the toolbar a whole separate set of size buttons.
const ERASER_SIZE_MULTIPLIER = 6;

export function DrawingPad({ name }: { name?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const drawing = useRef(false);
  const strokeDirtyRef = useRef(false);
  // Undo/redo stack of full-canvas pixel snapshots, plus where in it we
  // currently are. Kept in refs (not state) since every stroke would
  // otherwise re-render for no visual reason — canUndo/canRedo below are
  // the only parts of this that actually need to drive a re-render.
  const historyRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef(-1);
  const historyInitializedRef = useRef(false);

  const [isEmpty, setIsEmpty] = useState(true);
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [penSize, setPenSize] = useState(PEN_SIZES[1].value);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // The single source of truth handed to the enclosing <form> — a snapshot
  // of the drawn canvas, kept in sync so a native form submission (no
  // client JS gathering values) can see it.
  const [drawingDataUrl, setDrawingDataUrl] = useState<string | null>(null);

  function refreshUndoRedoState() {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }

  // A plain useEffect only fires once at mount, which can run before the
  // canvas has its real layout size (e.g. before fonts/layout settle) —
  // a callback ref + ResizeObserver avoids drawing onto a 0x0 backing
  // store, same reasoning as SignaturePad.
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
        // Record the very first blank canvas as the bottom of the undo
        // stack, so undoing the first stroke has something to land on.
        // Guarded to run once — later resizes (e.g. a layout shift) would
        // otherwise wipe out whatever history already exists.
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
    // Applied here (not just once at setup) so a color/pen-size/eraser
    // change takes effect on the very next stroke without re-touching the
    // canvas.
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
    if (isEmpty) setIsEmpty(false);
  }

  function handlePointerUp() {
    if (!drawing.current) return;
    drawing.current = false;
    // A click with no drag never actually painted anything — skip
    // recording a no-op entry onto the undo stack for it.
    if (strokeDirtyRef.current) commitHistory();
  }

  function commitHistory() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // Drawing after an undo discards whatever "future" redo states existed.
    const truncated = historyRef.current.slice(0, historyIndexRef.current + 1);
    truncated.push(snapshot);
    historyRef.current = truncated;
    historyIndexRef.current = truncated.length - 1;
    refreshUndoRedoState();
    setDrawingDataUrl(canvas.toDataURL("image/png"));
  }

  function restoreSnapshot(index: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const snapshot = historyRef.current[index];
    if (!canvas || !ctx || !snapshot) return;
    ctx.putImageData(snapshot, 0, 0);
    historyIndexRef.current = index;
    refreshUndoRedoState();
    const blank = index === 0;
    setIsEmpty(blank);
    setDrawingDataUrl(blank ? null : canvas.toDataURL("image/png"));
  }

  function undo() {
    if (historyIndexRef.current <= 0) return;
    restoreSnapshot(historyIndexRef.current - 1);
  }

  function redo() {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    restoreSnapshot(historyIndexRef.current + 1);
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

  // A "Clear" click is itself a recorded, undoable action (consistent with
  // undo/redo covering every change to the canvas, not just strokes) —
  // distinct from a native form reset below, which wipes the whole undo
  // stack rather than leaving a "re-clear" ghost behind it.
  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      commitHistory();
    }
    setIsEmpty(true);
    setDrawingDataUrl(null);
  }

  // The drawn canvas is plain React state with no native form control
  // backing it, so a native form reset wouldn't touch it without this.
  useEffect(() => {
    const formEl = canvasRef.current?.closest("form");
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
      setTool("pen");
      setIsEmpty(true);
      setDrawingDataUrl(null);
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
        <div className="flex items-center gap-1.5">
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
      </div>

      <div className="h-64 w-full overflow-hidden rounded-md border border-royal-200 bg-white">
        <canvas
          ref={attachCanvas}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onKeyDown={handleKeyDown}
          className="h-full w-full touch-none outline-none"
        />
      </div>

      {name && (
        <input type="hidden" name={name} value={drawingDataUrl ?? ""} readOnly />
      )}

      <div className="flex items-center justify-between text-xs">
        <span className="text-royal-400">
          {isEmpty ? "Draw above" : "Drawn"}
        </span>
        <button
          type="button"
          onClick={handleClear}
          className="font-medium text-royal-500 hover:underline"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
