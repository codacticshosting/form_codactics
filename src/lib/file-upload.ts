// Client- and server-safe rules for the general "File upload" field. The
// server's check of what a file really contains is in file-upload-check.ts.
export const FILE_UPLOAD_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "pptx",
];

export const FILE_UPLOAD_ACCEPT = FILE_UPLOAD_EXTENSIONS.map((ext) => `.${ext}`).join(",");

export const FILE_UPLOAD_TYPES_LABEL = "photo (PNG/JPEG), PDF, Word, Excel or PowerPoint (.pptx)";

export function fileUploadExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function isAllowedFileUploadName(fileName: string): boolean {
  return FILE_UPLOAD_EXTENSIONS.includes(fileUploadExtension(fileName));
}
