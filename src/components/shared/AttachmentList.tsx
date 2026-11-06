import { Download, FileText } from "lucide-react";
import type { FormAttachment } from "@/lib/attachments";
import { formatBytes } from "@/lib/storage-limits";

// What respondents see: images as thumbnails, PDFs as rows — each with a
// Download link. The file route always answers with a download, so a
// click never opens the file as a page on this site.
export function AttachmentList({ attachments }: { attachments: FormAttachment[] }) {
  if (attachments.length === 0) return null;
  const images = attachments.filter((a) => a.kind === "image");
  const pdfs = attachments.filter((a) => a.kind === "pdf");

  return (
    <div className="flex flex-col gap-2">
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((image) => (
            <a
              key={image.id}
              href={image.url}
              download={image.name}
              className="group flex flex-col gap-1 rounded-lg border border-royal-100 bg-white p-1.5 hover:border-royal-300"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt={image.name} className="h-24 w-full rounded object-cover" />
              <span className="flex items-center gap-1 truncate px-0.5 text-[11px] text-royal-600 group-hover:underline">
                <Download size={11} className="shrink-0" />
                <span className="truncate">{image.name}</span>
              </span>
            </a>
          ))}
        </div>
      )}
      {pdfs.map((pdf) => (
        <a
          key={pdf.id}
          href={pdf.url}
          download={pdf.name}
          className="flex items-center gap-3 rounded-lg border border-royal-100 bg-white px-3 py-2.5 hover:border-royal-300"
        >
          <FileText size={18} className="shrink-0 text-red-500" />
          <span className="min-w-0 flex-1 truncate text-sm text-royal-900">{pdf.name}</span>
          {pdf.size > 0 && <span className="shrink-0 text-xs text-royal-400">{formatBytes(pdf.size)}</span>}
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-royal-600 px-3 py-1 text-xs font-medium text-white">
            <Download size={12} />
            Download
          </span>
        </a>
      ))}
    </div>
  );
}
