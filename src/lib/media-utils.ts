// Shared between the Google Drive and local-storage backends — both need
// the same "does this form have an embedded image, and how do we walk its
// fields/theme to replace one" logic, differing only in where the actual
// bytes end up (a Drive upload vs a local file write).
import path from "node:path";
import {
  normalizeDropdownOption,
  type ButtonField,
  type FormField,
} from "@/types/form-builder";
import type { FormTheme } from "@/types/theme";

// One direction defines the other so they can't independently drift —
// local-storage.ts uses the mime->ext side when writing a saved image's
// filename, and the two local-file-serving routes use the ext->mime side
// to answer with the right Content-Type.
export const IMAGE_MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export const IMAGE_EXT_TO_CONTENT_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(IMAGE_MIME_TO_EXT).map(([mime, ext]) => [`.${ext}`, mime]),
);

// Resolves `root/...segments` and confirms the result never escapes
// `root` — every locally-served-file route needs this since the segments
// (a form id, a submission id, a filename) are attacker-controlled URL
// path pieces. Returns null rather than throwing when the check fails.
export function resolveSafePath(root: string, ...segments: string[]): string | null {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...segments);
  return resolved.startsWith(resolvedRoot + path.sep) ? resolved : null;
}

export function sanitizeName(input: string, fallback = "file"): string {
  const cleaned = input.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

// sanitizeName collapses every non-alphanumeric run (the "." included) to
// a single "_", which turns "photo.png" into "photo_png" — fine for a form
// title, but it silently strips the extension off an actual uploaded file,
// which then downloads without one. This sanitizes the base name the same
// way while keeping the extension intact.
export function sanitizeFileName(input: string): string {
  const dotIndex = input.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === input.length - 1) {
    return sanitizeName(input);
  }
  const base = sanitizeName(input.slice(0, dotIndex));
  const ext = input
    .slice(dotIndex + 1)
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
  return ext ? `${base}.${ext}` : base;
}

export function dataUrlToBuffer(
  dataUrl: string,
): { buffer: Buffer; mimeType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], buffer: Buffer.from(match[2], "base64") };
}

// Field types that can carry an admin-uploaded image, and whether any of
// them currently has one still embedded as base64 rather than already
// uploaded to Drive/local storage from a previous publish.
export function fieldsHaveEmbeddedImage(fields: FormField[]): boolean {
  return fields.some((f) => {
    if (f.type === "dropdown") {
      return f.options.some((o) => normalizeDropdownOption(o).imageDataUrl?.startsWith("data:"));
    }
    if (f.type === "button") return f.buttonImageDataUrl?.startsWith("data:");
    if (f.type === "static-text" || f.type === "image-display") {
      return f.imageDataUrl?.startsWith("data:");
    }
    if (f.type === "ranking") {
      return f.items.some((item) => item.imageDataUrl?.startsWith("data:"));
    }
    if (f.type === "design-board") {
      return f.baseImageDataUrl?.startsWith("data:");
    }
    return false;
  });
}

export function themeHasEmbeddedImage(theme: FormTheme): boolean {
  return (
    !!theme.logo.dataUrl?.startsWith("data:") ||
    !!theme.pageBackground.imageDataUrl?.startsWith("data:") ||
    theme.images.some((img) => img.dataUrl?.startsWith("data:"))
  );
}

// Walks every field that can carry an admin-uploaded image and replaces any
// embedded base64 data with whatever `uploadOne` turns it into (a Drive
// hotlink or a local schema-assets URL). Fields that already reference an
// uploaded image (from a previous publish) are left alone.
export async function replaceEmbeddedFieldImages(
  fields: FormField[],
  uploadOne: (dataUrl: string, hint: string) => Promise<string>,
): Promise<FormField[]> {
  const updated: FormField[] = [];
  for (const field of fields) {
    if (field.type === "dropdown") {
      const options = [];
      for (const [i, raw] of field.options.entries()) {
        const opt = normalizeDropdownOption(raw);
        options.push(
          opt.imageDataUrl?.startsWith("data:")
            ? {
                ...opt,
                imageDataUrl: await uploadOne(opt.imageDataUrl, `${field.label || "option"}_${i + 1}`),
              }
            : opt,
        );
      }
      updated.push({ ...field, options });
    } else if (field.type === "button" && field.buttonImageDataUrl?.startsWith("data:")) {
      updated.push({
        ...field,
        buttonImageDataUrl: await uploadOne(field.buttonImageDataUrl, field.label || "button"),
      } as ButtonField);
    } else if (
      (field.type === "static-text" || field.type === "image-display") &&
      field.imageDataUrl?.startsWith("data:")
    ) {
      updated.push({
        ...field,
        imageDataUrl: await uploadOne(field.imageDataUrl, field.label || field.type),
      });
    } else if (field.type === "ranking") {
      const items = [];
      for (const [i, item] of field.items.entries()) {
        items.push(
          item.imageDataUrl?.startsWith("data:")
            ? {
                ...item,
                imageDataUrl: await uploadOne(item.imageDataUrl, `${field.label || "item"}_${i + 1}`),
              }
            : item,
        );
      }
      updated.push({ ...field, items });
    } else if (field.type === "design-board" && field.baseImageDataUrl?.startsWith("data:")) {
      updated.push({
        ...field,
        baseImageDataUrl: await uploadOne(field.baseImageDataUrl, field.label || "template"),
      });
    } else {
      updated.push(field);
    }
  }
  return updated;
}

// Same idea, for the theme's own images — the header logo, the page
// background, and any images placed freely on the header canvas.
export async function replaceEmbeddedThemeImages(
  theme: FormTheme,
  uploadOne: (dataUrl: string, hint: string) => Promise<string>,
): Promise<FormTheme> {
  const logo = theme.logo.dataUrl?.startsWith("data:")
    ? { ...theme.logo, dataUrl: await uploadOne(theme.logo.dataUrl, "logo") }
    : theme.logo;

  const pageBackground = theme.pageBackground.imageDataUrl?.startsWith("data:")
    ? {
        ...theme.pageBackground,
        imageDataUrl: await uploadOne(theme.pageBackground.imageDataUrl, "background"),
      }
    : theme.pageBackground;

  const images: FormTheme["images"] = [];
  for (const img of theme.images) {
    images.push(
      img.dataUrl?.startsWith("data:")
        ? { ...img, dataUrl: await uploadOne(img.dataUrl, `image_${img.id}`) }
        : img,
    );
  }

  return { ...theme, logo, pageBackground, images };
}
