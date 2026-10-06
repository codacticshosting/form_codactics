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

export interface FormTheme {
  headerBackgroundColor: string;
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
