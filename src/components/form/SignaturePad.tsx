"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";

export function SignaturePad({ name }: { name?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  // The single source of truth handed to the enclosing <form> — either the
  // uploaded image or a snapshot of the drawn canvas, kept in sync so a
  // native form submission (no client JS gathering values) can see it.
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(
    null,
  );

  // A plain useEffect only fires once at mount, which can run before the
  // canvas has its real layout size (e.g. before fonts/layout settle), and
  // doesn't re-run when the canvas element is later unmounted/remounted (as
  // happens when switching between draw mode and an uploaded image). A
  // callback ref + ResizeObserver handles both cases.
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
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#14183a";
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
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
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
    if (isEmpty) setIsEmpty(false);
  }

  function handlePointerUp() {
    if (!drawing.current) return;
    drawing.current = false;
    if (canvasRef.current && !isEmpty) {
      setSignatureDataUrl(canvasRef.current.toDataURL("image/png"));
    }
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setUploadedImage(null);
    setSignatureDataUrl(null);
    setIsEmpty(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setUploadedImage(dataUrl);
      setSignatureDataUrl(dataUrl);
      setIsEmpty(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  // The drawn canvas and the uploaded-image preview are both plain React
  // state with no native form control backing them, so a native form
  // reset wouldn't touch either without this.
  useEffect(() => {
    const formEl = fileInputRef.current?.closest("form");
    if (!formEl) return;
    const handleReset = () => handleClear();
    formEl.addEventListener("reset", handleReset);
    return () => formEl.removeEventListener("reset", handleReset);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="h-36 w-full overflow-hidden rounded-md border border-royal-200 bg-white">
        {uploadedImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={uploadedImage}
            alt="Uploaded signature"
            className="h-full w-full object-contain"
          />
        ) : (
          <canvas
            ref={attachCanvas}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="h-full w-full touch-none"
          />
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />
      {name && (
        <input type="hidden" name={name} value={signatureDataUrl ?? ""} readOnly />
      )}

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="text-royal-400">
            {isEmpty ? "Sign above" : "Signed"}
          </span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 font-medium text-royal-500 hover:underline"
          >
            <Upload size={12} />
            Upload instead
          </button>
        </div>
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
