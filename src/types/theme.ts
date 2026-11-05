import type { CSSProperties } from "react";

export type TitleFontFamily = "sans" | "serif" | "mono";

export interface TextStyle {
  fontFamily: TitleFontFamily;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export interface ImageElement {
  id: string;
  dataUrl: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextElement extends TextStyle {
  id: string;
  content: string;
  x: number;
  y: number;
  width: number;
}

export interface PageBackground {
  color: string;
  imageDataUrl: string | null;
  opacity: number;
}

// An optional wide cover photo shown above the header, edited like a
// typical "cover photo" control: the image always fills a fixed 4:1 frame
// ("cover" fit), with zoom/pan layered on top rather than letting the
// admin freely resize or reposition it the way the other header elements
// work — a banner only ever needs "which part of my photo shows," not
// arbitrary placement.
export interface BannerImage {
  dataUrl: string | null;
  // 1 = the image is scaled to just cover the 4:1 frame; higher zooms in
  // further from there.
  zoom: number;
  // 0-1 fraction of the available pan range on each axis once zoomed in
  // past "cover" — 0.5 is centered. A fraction (not raw pixels) stays
  // meaningful no matter how large the frame is actually rendered.
  panX: number;
  panY: number;
}

export const BANNER_ASPECT_RATIO = 4; // 1600x400
export const BANNER_MIN_ZOOM = 1;
export const BANNER_MAX_ZOOM = 3;

export const DEFAULT_BANNER: BannerImage = { dataUrl: null, zoom: 1, panX: 0.5, panY: 0.5 };

// Shared by the editable banner control and its read-only display, so the
// exact same "cover, then zoom, then pan" math produces identical results
// in the builder and on the live published form.
export function computeBannerRect(
  containerWidth: number,
  containerHeight: number,
  naturalWidth: number,
  naturalHeight: number,
  banner: Pick<BannerImage, "zoom" | "panX" | "panY">,
): { width: number; height: number; left: number; top: number } {
  if (!containerWidth || !containerHeight || !naturalWidth || !naturalHeight) {
    return { width: containerWidth, height: containerHeight, left: 0, top: 0 };
  }
  const coverScale = Math.max(containerWidth / naturalWidth, containerHeight / naturalHeight);
  const scale = coverScale * Math.max(banner.zoom, BANNER_MIN_ZOOM);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  // width/height are always >= container's, so these are <= 0 — how far
  // left/up the image sits once panned fully toward that edge.
  const left = (containerWidth - width) * banner.panX;
  const top = (containerHeight - height) * banner.panY;
  return { width, height, left, top };
}

export interface FormTheme {
  headerBackgroundColor: string;
  banner: BannerImage;
  pageBackground: PageBackground;
  logo: {
    dataUrl: string | null;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  title: TextStyle & {
    x: number;
    y: number;
    width: number;
  };
  images: ImageElement[];
  texts: TextElement[];
  note: string;
}

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 280;
export const TITLE_BOX_HEIGHT = 16;

export const FONT_STACKS: Record<TitleFontFamily, string> = {
  sans: "var(--font-geist-sans), Arial, Helvetica, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "var(--font-geist-mono), 'Courier New', monospace",
};

export const DEFAULT_THEME: FormTheme = {
  headerBackgroundColor: "#eef1ff",
  banner: DEFAULT_BANNER,
  pageBackground: { color: "#f5f7ff", imageDataUrl: null, opacity: 100 },
  logo: { dataUrl: null, x: 6, y: 33, width: 12, height: 34 },
  title: {
    x: 24,
    y: 40,
    width: 56,
    fontFamily: "sans",
    fontSize: 30,
    color: "#14183a",
    bold: false,
    italic: false,
    underline: false,
  },
  images: [],
  texts: [],
  note: "",
};

export function createImageElement(): ImageElement {
  return { id: crypto.randomUUID(), dataUrl: null, x: 70, y: 8, width: 14, height: 40 };
}

export function createTextElement(): TextElement {
  return {
    id: crypto.randomUUID(),
    content: "New text",
    x: 24,
    y: 62,
    width: 56,
    fontFamily: "sans",
    fontSize: 18,
    color: "#14183a",
    bold: false,
    italic: false,
    underline: false,
  };
}

// Forms saved before the banner feature existed have no `banner` key at
// all in their stored theme JSON — patch it in here rather than crash
// wherever theme.banner is read. Called at every point a stored theme is
// parsed back out of the database.
export function normalizeTheme(raw: FormTheme): FormTheme {
  return raw.banner ? raw : { ...raw, banner: DEFAULT_BANNER };
}

export function textStyleToCss(style: TextStyle): CSSProperties {
  return {
    fontFamily: FONT_STACKS[style.fontFamily],
    fontSize: style.fontSize,
    color: style.color,
    fontWeight: style.bold ? 700 : 600,
    fontStyle: style.italic ? "italic" : "normal",
    textDecoration: style.underline ? "underline" : "none",
  };
}
