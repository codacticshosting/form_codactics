// Browser-only — resizes a respondent's photo before it's uploaded, when
// the form has "Optimize uploaded photos" on (Form.compressPhotos).

export const PHOTO_MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

// Returns a resized JPEG copy of `file` (longest side at most 1600 px), or
// the original file whenever that isn't possible or wouldn't help: not a
// PNG/JPEG, a browser that can't decode it, or a result that isn't
// actually smaller. Never throws — an upload must never fail just
// because optimizing it did.
//
// Drawing onto a canvas also drops the photo's hidden metadata (EXIF,
// including any GPS location); imageOrientation applies the camera's
// rotation first, so portrait phone photos don't come out sideways.
export async function compressPhoto(file: File): Promise<File> {
  if (file.type !== "image/jpeg" && file.type !== "image/png") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    // JPEG has no transparency — a transparent PNG gets a white
    // background instead of black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

// Puts `file` into a file input in place of what the respondent picked,
// so the form submits the optimized version. Setting `.files` doesn't
// fire a change event, so this can't loop back into the input's handler.
export function replaceInputFile(input: HTMLInputElement, file: File): boolean {
  try {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    return true;
  } catch {
    return false;
  }
}
