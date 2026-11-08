// Server-only — never imported from a "use client" file. Checks that a
// "File upload" answer really is what its name says, from its content:
// the name and the browser's reported type are whatever the sender chose.
import { fileUploadExtension } from "@/lib/file-upload";

const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

// The folder every Word/Excel/PowerPoint zip package keeps its content in —
// which also tells a real .docx apart from any other zip renamed to it.
const OFFICE_ZIP_FOLDER: Record<string, string> = { docx: "word/", xlsx: "xl/", pptx: "ppt/" };

function startsWith(bytes: Buffer, signature: Buffer): boolean {
  return bytes.subarray(0, signature.length).equals(signature);
}

export function fileContentMatchesName(fileName: string, bytes: Buffer): boolean {
  const ext = fileUploadExtension(fileName);
  switch (ext) {
    case "png":
      return startsWith(bytes, PNG_SIGNATURE);
    case "jpg":
    case "jpeg":
      return startsWith(bytes, JPEG_SIGNATURE);
    case "pdf":
      // The PDF format lets a little data precede the marker.
      return bytes.subarray(0, 1024).includes("%PDF-");
    case "doc":
    case "xls":
      return startsWith(bytes, OLE_SIGNATURE);
    case "docx":
    case "xlsx":
    case "pptx":
      // A password-protected Office file is stored in the older OLE container.
      return (
        startsWith(bytes, OLE_SIGNATURE) ||
        (startsWith(bytes, ZIP_SIGNATURE) &&
          bytes.includes("[Content_Types].xml") &&
          bytes.includes(OFFICE_ZIP_FOLDER[ext]))
      );
    default:
      return false;
  }
}
