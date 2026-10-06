"use client";

import { useRef, type ReactNode, type RefObject } from "react";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function DraggableBox({
  containerRef,
  x,
  y,
  width,
  height,
  onChange,
  resizable = false,
  minSize = 6,
  children,
}: {
  containerRef: RefObject<HTMLElement | null>;
  x: number;
  y: number;
  width: number;
  height: number;
  onChange: (updates: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }) => void;
  resizable?: boolean;
  minSize?: number;
  children: ReactNode;
}) {
  const dragStart = useRef<{
    pointerX: number;
    pointerY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const resizeStart = useRef<{
    pointerX: number;
    pointerY: number;
    origW: number;
    origH: number;
  } | null>(null);

  function handleDragPointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    dragStart.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      origX: x,
      origY: y,
    };
    window.addEventListener("pointermove", handleDragMove);
    window.addEventListener("pointerup", handleDragUp);
  }

  function handleDragMove(e: PointerEvent) {
    const start = dragStart.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!start || !rect) return;
    const dxPct = ((e.clientX - start.pointerX) / rect.width) * 100;
    const dyPct = ((e.clientY - start.pointerY) / rect.height) * 100;
    onChange({
      x: clamp(start.origX + dxPct, 0, 100 - width),
      y: clamp(start.origY + dyPct, 0, 100 - height),
    });
  }

  function handleDragUp() {
    dragStart.current = null;
    window.removeEventListener("pointermove", handleDragMove);
    window.removeEventListener("pointerup", handleDragUp);
  }

  function handleResizePointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    resizeStart.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      origW: width,
      origH: height,
    };
    window.addEventListener("pointermove", handleResizeMove);
    window.addEventListener("pointerup", handleResizeUp);
  }

  function handleResizeMove(e: PointerEvent) {
    const start = resizeStart.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!start || !rect) return;
    const dwPct = ((e.clientX - start.pointerX) / rect.width) * 100;
    const dhPct = ((e.clientY - start.pointerY) / rect.height) * 100;
    onChange({
      width: clamp(start.origW + dwPct, minSize, 100 - x),
      height: clamp(start.origH + dhPct, minSize, 100 - y),
    });
  }

  function handleResizeUp() {
    resizeStart.current = null;
    window.removeEventListener("pointermove", handleResizeMove);
    window.removeEventListener("pointerup", handleResizeUp);
  }

  return (
    <div
      onPointerDown={handleDragPointerDown}
      className="group absolute cursor-grab touch-none select-none active:cursor-grabbing"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${width}%`,
        height: `${height}%`,
      }}
    >
      <div className="pointer-events-none h-full w-full rounded-lg outline-dashed outline-1 outline-transparent group-hover:outline-royal-300">
        {children}
      </div>
      {resizable && (
        <div
          onPointerDown={handleResizePointerDown}
          className="absolute -right-1.5 -bottom-1.5 h-3.5 w-3.5 cursor-nwse-resize touch-none rounded-full border-2 border-white bg-royal-600 opacity-0 shadow group-hover:opacity-100"
        />
      )}
    </div>
  );
}
