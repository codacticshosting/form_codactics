"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Bold, Italic, Underline, Image as ImageIcon, Plus, X } from "lucide-react";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  DEFAULT_THEME,
  textStyleToCss,
  createImageElement,
  createTextElement,
  type FormTheme,
  type ImageElement,
  type TextElement,
} from "@/types/theme";
import { checkTitleAvailability } from "@/lib/form-actions";
import { useElementWidth } from "@/hooks/useElementWidth";
import { InlineMarkdown, MarkdownContent } from "@/components/shared/MarkdownContent";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import type { FormClosing } from "@/types/closing";
import type { AccessCodeSummary } from "@/lib/form-actions";
import { DraggableBox } from "./DraggableBox";
import { HeaderPreview } from "./HeaderPreview";
import { PageBackground } from "./PageBackground";

const MIN_TEXT_FONT_SIZE = 10;
const MAX_TEXT_FONT_SIZE = 96;
import { AccessCodeSettings } from "./AccessCodeSettings";

const SIDEBAR_WIDTH_STORAGE_KEY = "codactis:design-sidebar-width";
const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 560;
const SIDEBAR_DEFAULT_WIDTH = 300; // matches the old fixed 300px column

export function DesignStep({
  formTitle,
  onTitleChange,
  theme,
  onThemeChange,
  closing,
  onClosingChange,
  onContinue,
  formId,
  requireAccessCode,
  accessCodes,
  loginLimitFeatureEnabled,
  onNeedSignIn,
}: {
  formTitle: string;
  onTitleChange: (title: string) => void;
  theme: FormTheme;
  onThemeChange: (theme: FormTheme) => void;
  closing: FormClosing;
  onClosingChange: (closing: FormClosing) => void;
  onContinue: () => void;
  formId?: string | null;
  requireAccessCode?: boolean;
  accessCodes?: AccessCodeSummary[];
  loginLimitFeatureEnabled?: boolean;
  onNeedSignIn?: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapperWidth = useElementWidth(wrapperRef);
  const canvasScale = wrapperWidth > 0 ? wrapperWidth / CANVAS_WIDTH : 1;
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bgImageInputRef = useRef<HTMLInputElement>(null);
  const [titleWarning, setTitleWarning] = useState<string | null>(null);

  // How wide the settings sidebar is — draggable via the handle on its
  // right edge. The editor/preview column next to it just fills whatever
  // space is left, so widening the sidebar (e.g. for the longer field
  // labels/controls) borrows space from it instead of being capped on its
  // own. Remembered across visits via localStorage.
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const parsed = stored ? Number(stored) : NaN;
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, parsed));
    // Deferred a tick rather than set synchronously in the effect body —
    // same pattern as the title-warning effect below.
    const timer = setTimeout(() => setSidebarWidth(clamped), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  function handleSidebarResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    sidebarResizeRef.current = { startX: e.clientX, startWidth: sidebarWidth };
  }

  function handleSidebarResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!sidebarResizeRef.current) return;
    const next = sidebarResizeRef.current.startWidth + (e.clientX - sidebarResizeRef.current.startX);
    setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, next)));
  }

  function handleSidebarResizePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    sidebarResizeRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  useEffect(() => {
    const trimmed = formTitle.trim();
    if (!trimmed) {
      setTitleWarning(null);
      return;
    }
    const timer = setTimeout(async () => {
      const result = await checkTitleAvailability(trimmed, formId ?? undefined);
      if (result.taken) {
        const statusLabel =
          result.status === "draft" ? "draft" : "published";
        setTitleWarning(
          `You already have a ${statusLabel} form named "${trimmed}" — this one will be saved as "${trimmed}_2" to tell them apart.`,
        );
      } else {
        setTitleWarning(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [formTitle, formId]);

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onThemeChange({
        ...theme,
        logo: { ...theme.logo, dataUrl: reader.result as string },
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleBgImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onThemeChange({
        ...theme,
        pageBackground: {
          ...theme.pageBackground,
          imageDataUrl: reader.result as string,
        },
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function updateImage(id: string, updates: Partial<ImageElement>) {
    onThemeChange({
      ...theme,
      images: theme.images.map((img) =>
        img.id === id ? { ...img, ...updates } : img,
      ),
    });
  }

  function removeImage(id: string) {
    onThemeChange({
      ...theme,
      images: theme.images.filter((img) => img.id !== id),
    });
  }

  // The title/text boxes' resize handle controls font size, not a literal
  // pixel box — so its height (in the same 0-100 "% of canvas" units every
  // other draggable box uses) is just fontSize re-expressed as a fraction
  // of CANVAS_HEIGHT, converted back the moment the handle moves it.
  function fontSizeToHeightPercent(fontSize: number): number {
    return (fontSize / CANVAS_HEIGHT) * 100;
  }
  function heightPercentToFontSize(heightPercent: number): number {
    const size = Math.round((heightPercent / 100) * CANVAS_HEIGHT);
    return Math.min(Math.max(size, MIN_TEXT_FONT_SIZE), MAX_TEXT_FONT_SIZE);
  }

  function updateText(id: string, updates: Partial<TextElement>) {
    onThemeChange({
      ...theme,
      texts: theme.texts.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    });
  }

  function removeText(id: string) {
    onThemeChange({ ...theme, texts: theme.texts.filter((t) => t.id !== id) });
  }

  return (
    <main
      className="relative grid w-full gap-6 px-6 py-8 md:grid-cols-[var(--sidebar-width)_1fr]"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      <div className="flex flex-col gap-4 rounded-xl border border-royal-100 bg-white p-4 md:sticky md:top-6 md:h-fit md:max-h-[calc(100vh-3rem)] md:overflow-y-auto">
        <div>
          <label className="mb-1 block text-xs font-medium text-royal-700">
            Form title
          </label>
          <textarea
            value={formTitle}
            onChange={(e) => onTitleChange(e.target.value)}
            rows={2}
            placeholder={"Markdown supported — e.g. **Champions** Cup 2026\nPress Enter for a second line"}
            className="w-full resize-y rounded-md border border-royal-200 px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          />
          {titleWarning && (
            <p className="mt-1.5 text-xs text-amber-600">{titleWarning}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-royal-700">
            Header background color
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={theme.headerBackgroundColor}
              onChange={(e) =>
                onThemeChange({ ...theme, headerBackgroundColor: e.target.value })
              }
              className="h-9 w-9 shrink-0 cursor-pointer rounded border border-royal-200 p-0.5"
            />
            <input
              value={theme.headerBackgroundColor}
              onChange={(e) =>
                onThemeChange({ ...theme, headerBackgroundColor: e.target.value })
              }
              className="min-w-0 flex-1 rounded-md border border-royal-200 px-2.5 py-1.5 text-sm uppercase text-royal-950 focus:border-royal-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="border-t border-royal-100 pt-4">
          <label className="mb-1 block text-xs font-medium text-royal-700">
            Logo
          </label>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            className="hidden"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="flex-1 rounded-md border border-dashed border-royal-300 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50"
            >
              {theme.logo.dataUrl ? "Replace logo" : "Upload logo"}
            </button>
            {theme.logo.dataUrl && (
              <button
                type="button"
                onClick={() =>
                  onThemeChange({
                    ...theme,
                    logo: { ...theme.logo, dataUrl: null },
                  })
                }
                className="rounded-md border border-royal-200 px-2 py-1.5 text-xs text-royal-500 hover:bg-royal-50"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <div className="border-t border-royal-100 pt-4">
          <label className="mb-1 block text-xs font-medium text-royal-700">
            Title font
          </label>
          <select
            value={theme.title.fontFamily}
            onChange={(e) =>
              onThemeChange({
                ...theme,
                title: {
                  ...theme.title,
                  fontFamily: e.target.value as FormTheme["title"]["fontFamily"],
                },
              })
            }
            className="w-full rounded-md border border-royal-200 px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          >
            <option value="sans">Sans-serif</option>
            <option value="serif">Serif</option>
            <option value="mono">Monospace</option>
          </select>
        </div>

        <div>
          <label className="mb-1 flex items-center justify-between text-xs font-medium text-royal-700">
            <span>Title size</span>
            <span>{theme.title.fontSize}px</span>
          </label>
          <input
            type="range"
            min={16}
            max={56}
            value={theme.title.fontSize}
            onChange={(e) =>
              onThemeChange({
                ...theme,
                title: { ...theme.title, fontSize: Number(e.target.value) },
              })
            }
            className="w-full accent-royal-600"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-royal-700">
            Title color
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={theme.title.color}
              onChange={(e) =>
                onThemeChange({
                  ...theme,
                  title: { ...theme.title, color: e.target.value },
                })
              }
              className="h-9 w-9 shrink-0 cursor-pointer rounded border border-royal-200 p-0.5"
            />
            <input
              value={theme.title.color}
              onChange={(e) =>
                onThemeChange({
                  ...theme,
                  title: { ...theme.title, color: e.target.value },
                })
              }
              className="min-w-0 flex-1 rounded-md border border-royal-200 px-2.5 py-1.5 text-sm uppercase text-royal-950 focus:border-royal-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-royal-700">
            Title style
          </label>
          <div className="flex gap-1">
            <ToggleIconButton
              active={theme.title.bold}
              onClick={() =>
                onThemeChange({
                  ...theme,
                  title: { ...theme.title, bold: !theme.title.bold },
                })
              }
            >
              <Bold size={14} />
            </ToggleIconButton>
            <ToggleIconButton
              active={theme.title.italic}
              onClick={() =>
                onThemeChange({
                  ...theme,
                  title: { ...theme.title, italic: !theme.title.italic },
                })
              }
            >
              <Italic size={14} />
            </ToggleIconButton>
            <ToggleIconButton
              active={theme.title.underline}
              onClick={() =>
                onThemeChange({
                  ...theme,
                  title: { ...theme.title, underline: !theme.title.underline },
                })
              }
            >
              <Underline size={14} />
            </ToggleIconButton>
          </div>
        </div>

        <div className="border-t border-royal-100 pt-4">
          <label className="mb-2 block text-xs font-medium text-royal-700">
            Additional images
          </label>
          <div className="flex flex-col gap-2">
            {theme.images.map((image) => (
              <ImageElementCard
                key={image.id}
                image={image}
                onChange={(updates) => updateImage(image.id, updates)}
                onRemove={() => removeImage(image.id)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              onThemeChange({
                ...theme,
                images: [...theme.images, createImageElement()],
              })
            }
            className="mt-2 flex items-center gap-1.5 rounded-md border border-dashed border-royal-300 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50"
          >
            <Plus size={14} />
            Add image
          </button>
        </div>

        <div className="border-t border-royal-100 pt-4">
          <label className="mb-2 block text-xs font-medium text-royal-700">
            Additional text
          </label>
          <div className="flex flex-col gap-3">
            {theme.texts.map((text) => (
              <TextElementCard
                key={text.id}
                text={text}
                onChange={(updates) => updateText(text.id, updates)}
                onRemove={() => removeText(text.id)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              onThemeChange({
                ...theme,
                texts: [...theme.texts, createTextElement()],
              })
            }
            className="mt-2 flex items-center gap-1.5 rounded-md border border-dashed border-royal-300 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50"
          >
            <Plus size={14} />
            Add text
          </button>
        </div>

        <div className="border-t border-royal-100 pt-4">
          <label className="mb-1 block text-xs font-medium text-royal-700">
            Form background color
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={theme.pageBackground.color}
              onChange={(e) =>
                onThemeChange({
                  ...theme,
                  pageBackground: {
                    ...theme.pageBackground,
                    color: e.target.value,
                  },
                })
              }
              className="h-9 w-9 shrink-0 cursor-pointer rounded border border-royal-200 p-0.5"
            />
            <input
              value={theme.pageBackground.color}
              onChange={(e) =>
                onThemeChange({
                  ...theme,
                  pageBackground: {
                    ...theme.pageBackground,
                    color: e.target.value,
                  },
                })
              }
              className="min-w-0 flex-1 rounded-md border border-royal-200 px-2.5 py-1.5 text-sm uppercase text-royal-950 focus:border-royal-500 focus:outline-none"
            />
          </div>

          <label className="mt-3 mb-1 block text-xs font-medium text-royal-700">
            Form background photo
          </label>
          <input
            ref={bgImageInputRef}
            type="file"
            accept="image/*"
            onChange={handleBgImageUpload}
            className="hidden"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => bgImageInputRef.current?.click()}
              className="flex-1 rounded-md border border-dashed border-royal-300 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50"
            >
              {theme.pageBackground.imageDataUrl
                ? "Replace photo"
                : "Upload photo"}
            </button>
            {theme.pageBackground.imageDataUrl && (
              <button
                type="button"
                onClick={() =>
                  onThemeChange({
                    ...theme,
                    pageBackground: {
                      ...theme.pageBackground,
                      imageDataUrl: null,
                    },
                  })
                }
                className="rounded-md border border-royal-200 px-2 py-1.5 text-xs text-royal-500 hover:bg-royal-50"
              >
                Remove
              </button>
            )}
          </div>

          {theme.pageBackground.imageDataUrl && (
            <>
              <label className="mt-3 mb-1 flex items-center justify-between text-xs font-medium text-royal-700">
                <span>Photo transparency</span>
                <span>{theme.pageBackground.opacity}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={theme.pageBackground.opacity}
                onChange={(e) =>
                  onThemeChange({
                    ...theme,
                    pageBackground: {
                      ...theme.pageBackground,
                      opacity: Number(e.target.value),
                    },
                  })
                }
                className="w-full accent-royal-600"
              />
            </>
          )}

          <PageBackground
            background={theme.pageBackground}
            className="mt-3 h-16 w-full rounded-md border border-royal-100"
          />
        </div>

        <div className="border-t border-royal-100 pt-4">
          <label className="mb-1 block text-xs font-medium text-royal-700">
            Note (shown above the form fields)
          </label>
          <textarea
            value={theme.note}
            onChange={(e) => onThemeChange({ ...theme, note: e.target.value })}
            rows={3}
            placeholder="Markdown supported — e.g. Please read the **tournament rules** before registering."
            className="w-full resize-y rounded-md border border-royal-200 px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          />
        </div>

        <div className="border-t border-royal-100 pt-4">
          <label className="mb-2 block text-xs font-medium text-royal-700">
            Response deadline
          </label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-royal-700">
              <input
                type="radio"
                name="closing-mode"
                checked={closing.mode === "open"}
                onChange={() => onClosingChange({ ...closing, mode: "open" })}
              />
              Keep accepting responses
            </label>
            <label className="flex items-center gap-2 text-sm text-royal-700">
              <input
                type="radio"
                name="closing-mode"
                checked={closing.mode === "deadline"}
                onChange={() => onClosingChange({ ...closing, mode: "deadline" })}
              />
              Close automatically at a deadline
            </label>
            {closing.mode === "deadline" && (
              <div className="ml-6 flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={closing.dateStr}
                    onChange={(e) =>
                      onClosingChange({ ...closing, dateStr: e.target.value })
                    }
                    className="min-w-0 flex-1 rounded-md border border-royal-200 px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
                  />
                  <input
                    type="time"
                    value={closing.timeStr}
                    onChange={(e) =>
                      onClosingChange({ ...closing, timeStr: e.target.value })
                    }
                    className="w-28 rounded-md border border-royal-200 px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
                  />
                </div>
                <select
                  value={closing.timezoneId}
                  onChange={(e) =>
                    onClosingChange({ ...closing, timezoneId: e.target.value })
                  }
                  className="w-full rounded-md border border-royal-200 px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz.id} value={tz.id}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-royal-700">
              <input
                type="radio"
                name="closing-mode"
                checked={closing.mode === "manual"}
                onChange={() => onClosingChange({ ...closing, mode: "manual" })}
              />
              Stop accepting responses now
            </label>
          </div>
          {closing.mode !== "open" && (
            <p className="mt-2 text-xs text-royal-400">
              Visitors will see: &ldquo;Form is not taking any more data right
              now. Contact the organizer.&rdquo;
            </p>
          )}
        </div>

        <AccessCodeSettings
          formId={formId}
          initialRequireAccessCode={requireAccessCode ?? false}
          initialAccessCodes={accessCodes ?? []}
          loginLimitFeatureEnabled={loginLimitFeatureEnabled ?? false}
          onNeedSignIn={onNeedSignIn}
        />

        <button
          type="button"
          onClick={() => onThemeChange(DEFAULT_THEME)}
          className="self-start text-xs font-medium text-royal-500 hover:underline"
        >
          Reset layout
        </button>
      </div>

      {/* Drag to widen/narrow the settings sidebar — a sibling of it
          (not nested inside its own overflow-y-auto scroll box, which
          would otherwise clip anything positioned past its edge) so it's
          always visible and draggable regardless of sidebar scroll
          state. Desktop only, since the layout stacks below md. */}
      <div
        style={{ left: `calc(1.5rem + ${sidebarWidth}px + 0.75rem)` }}
        onPointerDown={handleSidebarResizePointerDown}
        onPointerMove={handleSidebarResizePointerMove}
        onPointerUp={handleSidebarResizePointerUp}
        onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
        title="Drag to resize — double-click to reset"
        className="absolute top-8 bottom-8 z-20 hidden w-3 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center md:flex"
      >
        <div className="h-16 w-1 rounded-full bg-royal-200 transition-colors hover:bg-royal-400" />
      </div>

      <div className="flex w-full max-w-3xl flex-col gap-6">
        <div>
          <p className="mb-2 text-xs font-medium text-royal-700">
            Editor — drag elements to position them
          </p>
          <div
            ref={wrapperRef}
            className="relative w-full overflow-hidden rounded-2xl border border-royal-200 shadow-sm"
            style={{
              aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
              backgroundColor: theme.headerBackgroundColor,
            }}
          >
          <div
            ref={canvasRef}
            className="absolute top-0 left-0"
            style={{
              width: CANVAS_WIDTH,
              height: CANVAS_HEIGHT,
              transform: `scale(${canvasScale})`,
              transformOrigin: "top left",
            }}
          >
            <DraggableBox
              containerRef={canvasRef}
              x={theme.logo.x}
              y={theme.logo.y}
              width={theme.logo.width}
              height={theme.logo.height}
              resizable
              onChange={(updates) =>
                onThemeChange({ ...theme, logo: { ...theme.logo, ...updates } })
              }
            >
              {theme.logo.dataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={theme.logo.dataUrl}
                  alt="Logo"
                  draggable={false}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-lg border-2 border-dashed border-royal-300 bg-white/70 text-royal-400">
                  <ImageIcon size={22} />
                </div>
              )}
            </DraggableBox>

            <DraggableBox
              containerRef={canvasRef}
              x={theme.title.x}
              y={theme.title.y}
              width={theme.title.width}
              height={fontSizeToHeightPercent(theme.title.fontSize)}
              resizable
              minSize={fontSizeToHeightPercent(MIN_TEXT_FONT_SIZE)}
              onChange={(updates) =>
                onThemeChange({
                  ...theme,
                  title: {
                    ...theme.title,
                    x: updates.x ?? theme.title.x,
                    y: updates.y ?? theme.title.y,
                    width: updates.width ?? theme.title.width,
                    fontSize:
                      updates.height !== undefined
                        ? heightPercentToFontSize(updates.height)
                        : theme.title.fontSize,
                  },
                })
              }
            >
              <div
                className="flex h-full w-full items-center"
                style={textStyleToCss(theme.title)}
              >
                <InlineMarkdown content={formTitle || "Untitled form"} />
              </div>
            </DraggableBox>

            {theme.images.map((image) => (
              <DraggableBox
                key={image.id}
                containerRef={canvasRef}
                x={image.x}
                y={image.y}
                width={image.width}
                height={image.height}
                resizable
                onChange={(updates) => updateImage(image.id, updates)}
              >
                {image.dataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image.dataUrl}
                    alt=""
                    draggable={false}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-lg border-2 border-dashed border-royal-300 bg-white/70 text-royal-400">
                    <ImageIcon size={18} />
                  </div>
                )}
              </DraggableBox>
            ))}

            {theme.texts.map((text) => (
              <DraggableBox
                key={text.id}
                containerRef={canvasRef}
                x={text.x}
                y={text.y}
                width={text.width}
                height={fontSizeToHeightPercent(text.fontSize)}
                resizable
                minSize={fontSizeToHeightPercent(MIN_TEXT_FONT_SIZE)}
                onChange={(updates) =>
                  updateText(text.id, {
                    x: updates.x ?? text.x,
                    y: updates.y ?? text.y,
                    width: updates.width ?? text.width,
                    fontSize:
                      updates.height !== undefined
                        ? heightPercentToFontSize(updates.height)
                        : text.fontSize,
                  })
                }
              >
                <div
                  className="flex h-full w-full items-center"
                  style={textStyleToCss(text)}
                >
                  <InlineMarkdown content={text.content} />
                </div>
              </DraggableBox>
            ))}
          </div>
          </div>
          <p className="mt-2 text-center text-xs text-royal-400">
            Drag any element to reposition it. Drag a corner handle to
            resize it — for text, that changes its font size.
          </p>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-royal-700">
            Final preview — what people will actually see
          </p>
          <HeaderPreview theme={theme} title={formTitle} />
        </div>

        {theme.note && (
          <div className="rounded-xl border border-royal-100 bg-white p-4">
            <MarkdownContent content={theme.note} />
          </div>
        )}

        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-medium text-royal-500 hover:underline"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={onContinue}
            className="rounded-full bg-royal-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-royal-700"
          >
            Continue to fields →
          </button>
        </div>
      </div>
    </main>
  );
}

function ToggleIconButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md p-1.5 transition-colors ${
        active
          ? "bg-royal-600 text-white"
          : "bg-royal-50 text-royal-500 hover:bg-royal-100"
      }`}
    >
      {children}
    </button>
  );
}

function ImageElementCard({
  image,
  onChange,
  onRemove,
}: {
  image: ImageElement;
  onChange: (updates: Partial<ImageElement>) => void;
  onRemove: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange({ dataUrl: reader.result as string });
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-royal-100 p-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-royal-50">
        {image.dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.dataUrl}
            alt=""
            className="h-full w-full object-contain"
          />
        ) : (
          <ImageIcon size={14} className="text-royal-300" />
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex-1 text-left text-xs font-medium text-royal-600 hover:underline"
      >
        {image.dataUrl ? "Replace" : "Upload image"}
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded p-1 text-royal-300 hover:bg-red-50 hover:text-red-600"
        aria-label="Remove image"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function TextElementCard({
  text,
  onChange,
  onRemove,
}: {
  text: TextElement;
  onChange: (updates: Partial<TextElement>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-royal-100 p-2.5">
      <div className="flex items-start gap-2">
        <textarea
          value={text.content}
          onChange={(e) => onChange({ content: e.target.value })}
          rows={2}
          placeholder="Markdown supported — **bold**, *italic*"
          className="min-w-0 flex-1 resize-y rounded border border-royal-200 px-2 py-1 text-xs text-royal-950 focus:border-royal-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-1 text-royal-300 hover:bg-red-50 hover:text-red-600"
          aria-label="Remove text"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={text.fontFamily}
          onChange={(e) =>
            onChange({
              fontFamily: e.target.value as TextElement["fontFamily"],
            })
          }
          className="min-w-0 flex-1 rounded border border-royal-200 px-1.5 py-1 text-xs text-royal-950 focus:border-royal-500 focus:outline-none"
        >
          <option value="sans">Sans</option>
          <option value="serif">Serif</option>
          <option value="mono">Mono</option>
        </select>
        <input
          type="number"
          min={10}
          max={48}
          value={text.fontSize}
          onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
          className="w-14 shrink-0 rounded border border-royal-200 px-1.5 py-1 text-xs text-royal-950 focus:border-royal-500 focus:outline-none"
        />
        <input
          type="color"
          value={text.color}
          onChange={(e) => onChange({ color: e.target.value })}
          className="h-7 w-7 shrink-0 cursor-pointer rounded border border-royal-200 p-0.5"
        />
      </div>
      <div className="flex gap-1">
        <ToggleIconButton
          active={text.bold}
          onClick={() => onChange({ bold: !text.bold })}
        >
          <Bold size={12} />
        </ToggleIconButton>
        <ToggleIconButton
          active={text.italic}
          onClick={() => onChange({ italic: !text.italic })}
        >
          <Italic size={12} />
        </ToggleIconButton>
        <ToggleIconButton
          active={text.underline}
          onClick={() => onChange({ underline: !text.underline })}
        >
          <Underline size={12} />
        </ToggleIconButton>
      </div>
    </div>
  );
}
