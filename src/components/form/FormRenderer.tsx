"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Image, FileText, Check, CircleCheck, CircleAlert, Star, X, GripVertical } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  normalizeDropdownOption,
  type FormField,
  type PlayerListColumn,
  type DropdownField,
  type RankingItem,
} from "@/types/form-builder";
import type { FormTheme } from "@/types/theme";
import { initialSubmitState, type SubmitState } from "@/types/submission";
import { applyOperation, formatComputedResult } from "@/lib/computed";
import { codeLanguageLabel } from "@/lib/field-types";
import { HeaderPreview } from "@/components/design/HeaderPreview";
import { MarkdownContent, InlineMarkdown } from "@/components/shared/MarkdownContent";
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  STORAGE_FILE_WONT_FIT_HINT,
} from "@/lib/storage-limits";
import { SignaturePad } from "./SignaturePad";
import { DrawingPad } from "./DrawingPad";
import { DesignBoardInput } from "./DesignBoardInput";

async function noopSubmitAction(): Promise<SubmitState> {
  return initialSubmitState;
}

// jsPDF's addImage/getImageProperties need actual image data (a data: URL
// or raw bytes) — a plain http(s) URL throws. Button images published
// through Google Drive or local storage are saved as hotlink URLs, not
// embedded base64, so they need fetching and re-encoding before jsPDF can
// draw them. Returns null (rather than throwing) on any failure — a
// missing thumbnail shouldn't take down the whole PDF.
async function toEmbeddablePdfImage(url: string): Promise<string | null> {
  if (url.startsWith("data:")) return url;
  // A Google Drive hotlink is cross-origin — fetching it directly from the
  // browser risks CORS blocking the read even though the image itself
  // displays fine in a plain <img>. Routing it through our own proxy route
  // sidesteps that; a same-origin schema-assets URL doesn't need it.
  const fetchUrl = url.startsWith("https://lh3.googleusercontent.com/")
    ? `/api/pdf-image-proxy?url=${encodeURIComponent(url)}`
    : url;
  try {
    const res = await fetch(fetchUrl);
    if (!res.ok) {
      console.warn("PDF image fetch failed:", fetchUrl, res.status);
      return null;
    }
    const contentType = res.headers.get("content-type") || "image/png";
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Building the base64 string directly from the fetched bytes (rather
    // than FileReader.readAsDataURL on a Blob) so the exact bytes jsPDF's
    // own magic-byte sniffing sees are the ones this function actually
    // fetched — chunked to stay well under btoa/String.fromCharCode's
    // per-call argument limit for a large image.
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return `data:${contentType};base64,${btoa(binary)}`;
  } catch (err) {
    console.warn("PDF image fetch failed:", fetchUrl, err);
    return null;
  }
}

interface FormSection {
  title: string | null;
  description: string;
  color?: string;
  fields: FormField[];
  // The section-break field that started this section, if any — used to
  // look up its popup (shown once, when the respondent advances into this
  // section via Next) without a separate lookup pass.
  sectionBreakField?: FormField;
}

// A section is excluded either because the admin hid it outright, or
// because it's restricted to specific access-code usernames and the
// current respondent (if any — an ungated form has no username at all)
// isn't one of them.
function isSectionExcludedForUser(
  field: Extract<FormField, { type: "section-break" }>,
  currentUsername: string | undefined,
): boolean {
  if (field.hidden) return true;
  if (field.visibleToUsernames && field.visibleToUsernames.length > 0) {
    return !currentUsername || !field.visibleToUsernames.includes(currentUsername);
  }
  return false;
}

// Excluding a section excludes everything in it, not just its own
// page-break marker — every field up to (but not including) the next
// section-break is skipped right along with it. A plain hidden field (not
// a section break) is still just itself, regardless of which section it's
// in.
function excludeHiddenFields(
  fields: FormField[],
  currentUsername?: string,
): FormField[] {
  const visible: FormField[] = [];
  let inExcludedSection = false;
  for (const field of fields) {
    if (field.type === "section-break") {
      inExcludedSection = isSectionExcludedForUser(field, currentUsername);
      if (!inExcludedSection) visible.push(field);
      continue;
    }
    if (inExcludedSection || field.hidden) continue;
    visible.push(field);
  }
  return visible;
}

function splitIntoSections(fields: FormField[]): FormSection[] {
  const sections: FormSection[] = [{ title: null, description: "", fields: [] }];
  for (const field of fields) {
    if (field.type === "section-break") {
      sections.push({
        title: field.label || "Untitled section",
        description: field.description,
        color: field.color,
        fields: [],
        sectionBreakField: field,
      });
    } else {
      sections[sections.length - 1].fields.push(field);
    }
  }
  const nonEmpty = sections.filter((s) => s.fields.length > 0);
  return nonEmpty.length > 0 ? nonEmpty : sections;
}

// A structured (not React-specific) representation of one answer's value,
// so the exact same data can drive both the on-screen review card and the
// PDF export without keeping two separate extraction passes in sync.
type ReviewValue =
  | { kind: "text"; text: string }
  | { kind: "image"; dataUrl: string; alt: string }
  | { kind: "rows"; entries: { label: string; value: string }[][] }
  | {
      kind: "button";
      buttonText: string;
      imageDataUrl?: string;
      answers: { label: string; value: string }[];
    };

interface ReviewItem {
  id: string;
  label: string;
  value: ReviewValue;
}

interface ReviewSection {
  title: string | null;
  items: ReviewItem[];
}

// Shared by Repeating-list rows and Button sub-answers — same "read this
// column's value out of FormData, using the filename for a photo" logic
// regardless of which composite field the column belongs to.
function columnDisplayValue(column: PlayerListColumn, formData: FormData, key: string): string {
  if (column.type === "photo") {
    const file = formData.get(key);
    return file instanceof File && file.size > 0 ? file.name : "";
  }
  return String(formData.get(key) ?? "");
}

function reviewPlayerListRows(
  field: Extract<FormField, { type: "player-list" }>,
  formData: FormData,
) {
  const rows: { label: string; value: string }[][] = [];
  for (let i = 0; i < field.playerCount; i++) {
    const row = field.columns.map((column) => ({
      label: column.label,
      value: columnDisplayValue(column, formData, `player-${i}-${column.id}`),
    }));
    if (row.some((c) => c.value)) rows.push(row);
  }
  return rows;
}

function reviewButtonAnswer(
  field: Extract<FormField, { type: "button" }>,
  formData: FormData,
): ReviewValue {
  const answers = field.fields
    .map((column) => ({
      label: column.label,
      value: columnDisplayValue(column, formData, `${field.id}__${column.id}`),
    }))
    .filter((a) => a.value);
  return {
    kind: "button",
    buttonText: field.buttonText,
    imageDataUrl:
      field.buttonStyle === "image" ? field.buttonImageDataUrl : undefined,
    answers,
  };
}

function reviewValueForField(field: FormField, formData: FormData): ReviewValue {
  switch (field.type) {
    case "dropdown": {
      const otherText = String(formData.get(`${field.id}__other`) ?? "");
      if (field.allowMultiple) {
        const resolved = formData
          .getAll(field.id)
          .map(String)
          .map((v) => (v === "__other__" ? otherText : v))
          .filter(Boolean);
        return { kind: "text", text: resolved.length ? resolved.join(", ") : "—" };
      }
      const selected = String(formData.get(field.id) ?? "");
      const resolved = selected === "__other__" ? otherText : selected;
      return { kind: "text", text: resolved || "—" };
    }
    case "photo":
    case "document": {
      const file = formData.get(field.id);
      return {
        kind: "text",
        text: file instanceof File && file.size > 0 ? file.name : "No file uploaded",
      };
    }
    case "signature": {
      const raw = formData.get(field.id);
      const dataUrl = typeof raw === "string" ? raw : "";
      return dataUrl
        ? { kind: "image", dataUrl, alt: "Signature" }
        : { kind: "text", text: "Not signed" };
    }
    case "drawing": {
      const raw = formData.get(field.id);
      const dataUrl = typeof raw === "string" ? raw : "";
      return dataUrl
        ? { kind: "image", dataUrl, alt: "Drawing" }
        : { kind: "text", text: "Nothing drawn" };
    }
    case "design-board": {
      const raw = formData.get(field.id);
      const dataUrl = typeof raw === "string" ? raw : "";
      return dataUrl
        ? { kind: "image", dataUrl, alt: "Design" }
        : { kind: "text", text: "Nothing designed" };
    }
    case "code": {
      const code = String(formData.get(field.id) ?? "");
      const language = String(formData.get(`${field.id}__language`) ?? "");
      if (!code) return { kind: "text", text: "—" };
      return {
        kind: "text",
        text: language ? `[${codeLanguageLabel(language)}]\n${code}` : code,
      };
    }
    default:
      return { kind: "text", text: String(formData.get(field.id) ?? "") || "—" };
  }
}

function reviewValueNode(value: ReviewValue): ReactNode {
  switch (value.kind) {
    case "text":
      return value.text;
    case "image":
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value.dataUrl}
          alt={value.alt}
          className="h-16 rounded border border-royal-100 bg-white"
        />
      );
    case "rows":
      return value.entries.length === 0 ? (
        "No entries"
      ) : (
        <div className="flex flex-col gap-1.5">
          {value.entries.map((row, i) => (
            <div key={i} className="text-xs text-royal-700">
              <span className="font-medium text-royal-500">Entry {i + 1}: </span>
              {row.map((c) => `${c.label}: ${c.value || "—"}`).join(", ")}
            </div>
          ))}
        </div>
      );
    case "button":
      return (
        <div className="flex flex-col gap-1.5">
          {(value.imageDataUrl || value.buttonText) && (
            <div className="flex items-center gap-2">
              {value.imageDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={value.imageDataUrl}
                  alt={value.buttonText}
                  className="h-10 w-10 shrink-0 rounded-lg border border-royal-100 object-cover"
                />
              )}
              {value.buttonText && (
                <span className="font-medium text-royal-950">
                  {value.buttonText}
                </span>
              )}
            </div>
          )}
          {value.answers.length === 0 ? (
            <span className="text-royal-500">Not answered</span>
          ) : (
            <span className="text-royal-800">
              {value.answers.map((a) => `${a.label}: ${a.value}`).join(", ")}
            </span>
          )}
        </div>
      );
  }
}

function buildReviewSections(
  sections: FormSection[],
  formData: FormData,
): ReviewSection[] {
  return sections
    .map((section) => {
      const items: ReviewItem[] = [];
      for (const field of section.fields) {
        if (
          field.type === "static-text" ||
          field.type === "section-break" ||
          field.type === "image-display"
        ) {
          continue;
        }
        if (field.type === "computed" && !field.showOnForm) continue;
        if (field.type === "player-list") {
          items.push({
            id: field.id,
            label: field.label || "Untitled question",
            value: { kind: "rows", entries: reviewPlayerListRows(field, formData) },
          });
          continue;
        }
        if (field.type === "button") {
          items.push({
            id: field.id,
            label: field.label || "Untitled question",
            value: reviewButtonAnswer(field, formData),
          });
          continue;
        }
        items.push({
          id: field.id,
          label: field.label || "Untitled question",
          value: reviewValueForField(field, formData),
        });
      }
      return { title: section.title, items };
    })
    .filter((s) => s.items.length > 0);
}

export function FormRenderer({
  title,
  fields: allFields,
  theme,
  submitAction,
  checkUploadFits,
  currentUsername,
}: {
  title: string;
  fields: FormField[];
  theme?: FormTheme;
  submitAction?: (
    prevState: SubmitState,
    formData: FormData,
  ) => Promise<SubmitState>;
  // Asks the server whether a just-picked file still fits in the form
  // owner's storage — absent in the builder preview, where nothing is
  // ever submitted.
  checkUploadFits?: (bytes: number) => Promise<boolean>;
  // The access-code username the respondent logged in as, if the form is
  // gated — used to filter sections restricted to specific users. Absent
  // entirely on a form that doesn't require access codes.
  currentUsername?: string;
}) {
  // Hidden fields (and everything inside a hidden or not-for-this-user
  // section) stay in the form's definition — so the admin can un-hide or
  // reassign it without losing settings — but never reach the respondent.
  // Filtered once here so every downstream consumer (sections, the Review
  // screen, the PDF export) is consistent.
  const fields = excludeHiddenFields(allFields, currentUsername);
  const sections = splitIntoSections(fields);
  const [step, setStep] = useState(0);
  const currentStep = Math.min(step, sections.length - 1);
  const isMultiStep = sections.length > 1;
  const isLastStep = currentStep === sections.length - 1;
  const formRef = useRef<HTMLFormElement>(null);
  // When this form was rendered — submitFormAction rejects anything that
  // comes back faster than a human plausibly could, a cheap signal against
  // scripted bots that fill and submit in milliseconds. Written to the
  // hidden input's DOM node directly in an effect (not React state/props)
  // since Date.now() is impure and can't run during render.
  const renderedAtInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renderedAtInputRef.current) {
      renderedAtInputRef.current.value = String(Date.now());
    }
  }, []);
  const [showReview, setShowReview] = useState(false);
  const [reviewSections, setReviewSections] = useState<ReviewSection[]>([]);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  // Guards against a fast reflexive second click landing on the button
  // that just replaced whatever was in that same screen spot a moment
  // earlier (Next → Review, or Review → Done) — without this, that click
  // could skip straight past the review screen the user hasn't seen yet.
  const [justEnteredReview, setJustEnteredReview] = useState(false);
  const [state, formAction, isPending] = useActionState(
    submitAction ?? noopSubmitAction,
    initialSubmitState,
  );

  const [activePopup, setActivePopup] = useState<{ title: string; content: string } | null>(
    null,
  );
  const shownPopupIds = useRef<Set<string>>(new Set());

  function triggerPopup(field: FormField) {
    if (!field.popup?.enabled || !field.popup.content) return;
    if (!field.popup.repeat && shownPopupIds.current.has(field.id)) return;
    shownPopupIds.current.add(field.id);
    setActivePopup({ title: field.popup.title, content: field.popup.content });
  }

  function tryEnterReview() {
    const formEl = formRef.current;
    if (!formEl || !formEl.reportValidity()) return;
    setReviewSections(buildReviewSections(sections, new FormData(formEl)));
    setShowReview(true);
    setJustEnteredReview(true);
    window.setTimeout(() => setJustEnteredReview(false), 400);
  }

  async function downloadReviewAsPdf() {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const { jsPDF, GState } = await import("jspdf");
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 48;
      const contentWidth = pageWidth - margin * 2;
      // The title sits well clear of the physical top edge, the rule line
      // clear of the title's own descenders, and body content clear of the
      // rule line — each with its own margin rather than one shared gap,
      // so a slightly taller title font never lets one bleed into the next.
      const titleBaselineY = margin + 12;
      const ruleY = titleBaselineY + 14;
      const headerHeight = ruleY - margin + 24;
      const bottomLimit = pageHeight - margin;
      let y = margin + headerHeight;

      // Admin's own form logo if they set one, otherwise fall back to the
      // Codactics logo — fetched as a data URL since jsPDF can't reference
      // a plain file path.
      const watermarkDataUrl =
        theme?.logo.dataUrl ||
        (await fetch("/logo/codactics.png")
          .then((res) => res.blob())
          .then(
            (blob) =>
              new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              }),
          )
          .catch(() => null));

      // jsPDF's built-in fonts don't reliably render an em dash.
      const pdfSafe = (text: string) => text.replace(/—/g, "-");

      // The header title is drawn as one fixed-position line via a raw
      // pdf.text() call (not the wrapping writeLines helper below) — an
      // embedded newline (titles are saved sanitized now, but older forms
      // may already have one saved) would make jsPDF's own default line
      // spacing kick in there and collide with the rule line right under it.
      const pdfTitle = (title || "Untitled form").replace(/\s+/g, " ").trim();

      function ensureSpace(needed: number) {
        if (y + needed > bottomLimit) {
          pdf.addPage();
          y = margin + headerHeight;
        }
      }

      function writeLines(text: string, size: number, color: number) {
        pdf.setFontSize(size);
        pdf.setTextColor(color);
        const lines = pdf.splitTextToSize(pdfSafe(text), contentWidth) as string[];
        for (const line of lines) {
          ensureSpace(size + 4);
          pdf.text(line, margin, y);
          y += size + 4;
        }
      }

      // Resolved once, up front, in parallel — rather than one network
      // round trip per image awaited inline inside the draw loop below.
      const imageUrls = new Set<string>();
      for (const section of reviewSections) {
        for (const item of section.items) {
          if (item.value.kind === "button" && item.value.imageDataUrl) {
            imageUrls.add(item.value.imageDataUrl);
          }
        }
      }
      const embeddableImages = new Map(
        await Promise.all(
          Array.from(imageUrls).map(
            async (url) => [url, await toEmbeddablePdfImage(url)] as const,
          ),
        ),
      );

      for (const section of reviewSections) {
        if (section.title) {
          ensureSpace(30);
          pdf.setFont("helvetica", "bold");
          writeLines(section.title, 13, 20);
          pdf.setFont("helvetica", "normal");
          y += 4;
        }

        for (const item of section.items) {
          ensureSpace(28);
          pdf.setFont("helvetica", "bold");
          writeLines(item.label, 9, 110);
          pdf.setFont("helvetica", "normal");

          if (item.value.kind === "text") {
            writeLines(item.value.text, 11, 20);
          } else if (item.value.kind === "image") {
            try {
              const props = pdf.getImageProperties(item.value.dataUrl);
              const imgWidth = 140;
              const imgHeight = (props.height * imgWidth) / props.width;
              ensureSpace(imgHeight);
              pdf.addImage(item.value.dataUrl, margin, y, imgWidth, imgHeight);
              y += imgHeight + 4;
            } catch {
              writeLines("Signed", 11, 20);
            }
          } else if (item.value.kind === "rows") {
            if (item.value.entries.length === 0) {
              writeLines("No entries", 11, 20);
            } else {
              item.value.entries.forEach((row, i) => {
                const line = `Entry ${i + 1}: ${row
                  .map((c) => `${c.label}: ${c.value || "—"}`)
                  .join(", ")}`;
                writeLines(line, 10, 20);
              });
            }
          } else {
            if (item.value.imageDataUrl) {
              const embeddable = embeddableImages.get(item.value.imageDataUrl) ?? null;
              try {
                if (!embeddable) throw new Error("Image could not be fetched");
                const props = pdf.getImageProperties(embeddable);
                const imgWidth = 60;
                const imgHeight = (props.height * imgWidth) / props.width;
                ensureSpace(imgHeight);
                pdf.addImage(embeddable, margin, y, imgWidth, imgHeight);
                y += imgHeight + 8;
              } catch (err) {
                // Skip the thumbnail rather than failing the whole PDF —
                // but still log it, since this used to fail completely
                // silently.
                console.warn("Button image PDF embed failed:", err);
              }
            }
            if (item.value.buttonText) {
              writeLines(item.value.buttonText, 11, 20);
            }
            writeLines(
              item.value.answers.length === 0
                ? "Not answered"
                : item.value.answers.map((a) => `${a.label}: ${a.value}`).join(", "),
              10,
              20,
            );
          }
          y += 8;
        }
        y += 6;
      }

      // Applied per-page after all content is written, since pages are
      // only created on demand above and we don't know the final count
      // (or want a header/watermark/footer on every one of them) until now.
      const downloadedAt = `Downloaded ${new Date().toLocaleString()}`;
      const totalPages = pdf.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        pdf.setPage(p);

        if (watermarkDataUrl) {
          try {
            const props = pdf.getImageProperties(watermarkDataUrl);
            const maxDim = 220;
            let wmWidth = maxDim;
            let wmHeight = (props.height * wmWidth) / props.width;
            if (wmHeight > maxDim) {
              wmHeight = maxDim;
              wmWidth = (props.width * wmHeight) / props.height;
            }
            pdf.saveGraphicsState();
            pdf.setGState(new GState({ opacity: 0.12 }));
            pdf.addImage(
              watermarkDataUrl,
              (pageWidth - wmWidth) / 2,
              (pageHeight - wmHeight) / 2,
              wmWidth,
              wmHeight,
            );
            pdf.restoreGraphicsState();
          } catch (err) {
            console.error("PDF watermark failed to draw", err);
          }
        }

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(14);
        pdf.setTextColor(20);
        pdf.text(pdfTitle, margin, titleBaselineY);
        pdf.setDrawColor(180);
        pdf.setLineWidth(1);
        pdf.line(margin, ruleY, pageWidth - margin, ruleY);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.5);
        pdf.setTextColor(90);
        pdf.text(downloadedAt, margin, pageHeight - 32);
        pdf.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 32, {
          align: "right",
        });
        pdf.text(
          "Developed and maintained by CODACTICS  •  http://forms.codactics.com/",
          pageWidth / 2,
          pageHeight - 18,
          { align: "center" },
        );
      }

      const safeTitle = pdfTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "form";
      pdf.save(`${safeTitle}-submission.pdf`);
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      {theme ? (
        <HeaderPreview theme={theme} title={title} />
      ) : (
        <div className="rounded-2xl border-t-4 border-royal-600 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-royal-950">
            <InlineMarkdown content={title || "Untitled form"} />
          </h1>
        </div>
      )}

      {theme?.note && (
        <div className="rounded-xl border border-royal-100 bg-white p-4">
          <MarkdownContent content={theme.note} />
        </div>
      )}

      {state.status === "success" ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-royal-100 bg-white p-10 text-center shadow-sm">
          <CircleCheck size={28} className="text-royal-600" />
          <h2 className="text-lg font-semibold text-royal-950">
            Response recorded
          </h2>
          <p className="max-w-sm text-sm text-royal-500">
            Thanks — your submission has been saved.
          </p>
          <button
            type="button"
            disabled={downloadingPdf}
            onClick={downloadReviewAsPdf}
            className="mt-1 rounded-full border border-royal-200 px-6 py-2.5 text-sm font-medium text-royal-600 transition-colors hover:bg-royal-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloadingPdf ? "Preparing…" : "Download PDF"}
          </button>
        </div>
      ) : fields.length === 0 ? (
        <p className="rounded-xl border border-dashed border-royal-200 bg-white p-8 text-center text-sm text-royal-400">
          This form doesn't have any fields yet.
        </p>
      ) : (
        <form
          ref={formRef}
          className="flex flex-col gap-4"
          // Dispatched by hand rather than via the `action` prop: React
          // resets a form's fields after an `action` completes even when
          // it returned an error, wiping everything the respondent typed
          // just because e.g. the owner's storage was full. On success
          // the whole form is replaced by the confirmation anyway.
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            startTransition(() => formAction(formData));
          }}
        >
          {/* Honeypot — invisible to a real visitor (off-screen, never
              focusable), but a naive bot that fills every field it finds
              will fill this one too. Non-empty on submit = silently
              dropped by submitFormAction. */}
          <div
            aria-hidden="true"
            className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden"
          >
            <label htmlFor="website">Leave this field blank</label>
            <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
          </div>
          <input ref={renderedAtInputRef} type="hidden" name="formRenderedAt" defaultValue="" readOnly />

          {state.status === "error" && state.message && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <CircleAlert size={16} className="shrink-0" />
              {state.message}
            </div>
          )}

          {!showReview && isMultiStep && (
            <div className="flex items-center justify-center gap-2 pb-1">
              {sections.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${
                    i === currentStep ? "bg-royal-600" : "bg-royal-200"
                  }`}
                />
              ))}
            </div>
          )}

          <UploadFitContext.Provider value={checkUploadFits ?? null}>
          <PopupTriggerContext.Provider value={triggerPopup}>
            {sections.map((section, i) => (
              <div
                key={i}
                className={
                  !showReview && i === currentStep
                    ? "flex flex-col gap-4"
                    : "hidden"
                }
              >
                {section.title && (
                  <div>
                    <h2
                      className="text-lg font-semibold text-royal-950"
                      style={section.color ? { color: section.color } : undefined}
                    >
                      {section.title}
                    </h2>
                    {section.description && (
                      <div className="mt-1">
                        <MarkdownContent
                          content={section.description}
                          color={section.color}
                        />
                      </div>
                    )}
                  </div>
                )}
                {section.fields.map((field) => (
                  <FieldRenderer key={field.id} field={field} />
                ))}
              </div>
            ))}
          </PopupTriggerContext.Provider>
          </UploadFitContext.Provider>

          {activePopup && (
            <PopupModal popup={activePopup} onDismiss={() => setActivePopup(null)} />
          )}

          {showReview && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-royal-100 bg-white p-5 shadow-sm">
                <h2 className="mb-1 text-lg font-semibold text-royal-950">
                  Review your answers
                </h2>
                <p className="mb-4 text-sm text-royal-500">
                  Check everything below before finishing. Use Edit to change
                  anything.
                </p>
                <div className="flex flex-col gap-5">
                  {reviewSections.map((section, i) => (
                    <div key={i} className="flex flex-col gap-3">
                      {section.title && (
                        <h3 className="text-sm font-semibold text-royal-800">
                          {section.title}
                        </h3>
                      )}
                      {section.items.map((item) => (
                        <div
                          key={item.id}
                          className="border-b border-royal-50 pb-2 last:border-0 last:pb-0"
                        >
                          <p className="text-xs font-medium text-royal-500">
                            {item.label}
                          </p>
                          <div className="mt-0.5 text-sm text-royal-950">
                            {reviewValueNode(item.value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setShowReview(false);
                    setStep(0);
                  }}
                  className="rounded-full border border-royal-200 px-6 py-2.5 text-sm font-medium text-royal-600 transition-colors hover:bg-royal-50"
                >
                  Edit
                </button>
                <button
                  type="submit"
                  disabled={isPending || justEnteredReview}
                  className="rounded-full bg-royal-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-royal-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? "Submitting…" : "Done"}
                </button>
              </div>
            </div>
          )}

          {!showReview && (
            <div className="mt-2 flex items-center justify-between">
              {isMultiStep && !isLastStep ? (
                <>
                  <button
                    type="button"
                    disabled={currentStep === 0}
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                    className="rounded-full border border-royal-200 px-6 py-2.5 text-sm font-medium text-royal-600 transition-colors hover:bg-royal-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.min(sections.length - 1, step + 1);
                      const enteredSection = sections[next];
                      if (enteredSection?.sectionBreakField) {
                        triggerPopup(enteredSection.sectionBreakField);
                      }
                      setStep(next);
                    }}
                    className="rounded-full bg-royal-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-royal-700"
                  >
                    Next
                  </button>
                </>
              ) : isMultiStep ? (
                <>
                  <button
                    type="button"
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                    className="rounded-full border border-royal-200 px-6 py-2.5 text-sm font-medium text-royal-600 transition-colors hover:bg-royal-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={tryEnterReview}
                    className="rounded-full bg-royal-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-royal-700"
                  >
                    Review
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={tryEnterReview}
                    className="rounded-full bg-royal-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-royal-700"
                  >
                    Review
                  </button>
                  <button
                    type="reset"
                    className="rounded-full border border-royal-200 px-6 py-2.5 text-sm font-medium text-royal-600 transition-colors hover:bg-royal-50"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          )}

          {!showReview && isMultiStep && (
            <button
              type="reset"
              onClick={() => setStep(0)}
              className="self-center text-xs font-medium text-royal-400 hover:text-royal-600 hover:underline"
            >
              Clear form
            </button>
          )}
        </form>
      )}
    </div>
  );
}

// Lets FieldCard (used from ~15 call sites across FieldRenderer's switch)
// trigger a field's popup on first focus without threading a callback prop
// through every single one of those call sites individually.
const PopupTriggerContext = createContext<(field: FormField) => void>(() => {});

// The same idea for the file inputs: checkUploadFits from FormRenderer's
// props, reachable from the photo/document inputs however deeply they're
// nested (repeating lists, button groups) without prop threading.
const UploadFitContext = createContext<((bytes: number) => Promise<boolean>) | null>(null);

// After a file passes the local checks, asks whether it fits the owner's
// remaining storage; if not, clears the input and reports the hint. A
// failed lookup is ignored — the server checks again on submit anyway.
function useUploadFitCheck() {
  const checkFits = useContext(UploadFitContext);
  return (input: HTMLInputElement, file: File, onWontFit: (message: string) => void) => {
    if (!checkFits) return;
    checkFits(file.size)
      .then((fits) => {
        // Ignore the answer if the respondent has picked another file since.
        if (!fits && input.files?.[0] === file) {
          input.value = "";
          onWontFit(STORAGE_FILE_WONT_FIT_HINT);
        }
      })
      .catch(() => {});
  };
}

function FieldCard({
  field,
  children,
}: {
  field: FormField;
  children: ReactNode;
}) {
  const triggerPopup = useContext(PopupTriggerContext);
  return (
    <div
      className="rounded-xl border border-royal-100 bg-white p-5 shadow-sm"
      onFocusCapture={() => triggerPopup(field)}
    >
      <label className="mb-2 block text-sm font-medium text-royal-950">
        {field.label || "Untitled question"}
        {field.required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function PopupModal({
  popup,
  onDismiss,
}: {
  popup: { title: string; content: string };
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        {popup.title && (
          <h3 className="mb-2 text-base font-semibold text-royal-950">
            {popup.title}
          </h3>
        )}
        <MarkdownContent content={popup.content} />
        <button
          type="button"
          onClick={onDismiss}
          className="mt-4 w-full rounded-full bg-royal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-royal-700"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

// Shared full-screen lightbox for any admin-uploaded image shown to
// respondents — dropdown option thumbnails, Message/Image field pictures.
// Backdrop click or Close dismisses it.
function ImageZoomModal({
  image,
  onClose,
}: {
  image: { url: string; alt: string } | null;
  onClose: () => void;
}) {
  if (!image) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-full max-w-full flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={image.alt}
          className="max-h-[75vh] max-w-full rounded-lg object-contain shadow-2xl"
        />
        {image.alt && (
          <p className="text-center text-sm font-medium text-white">{image.alt}</p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white px-5 py-1.5 text-xs font-medium text-royal-700 hover:bg-royal-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function FieldRenderer({ field }: { field: FormField }) {
  switch (field.type) {
    case "short-text":
      return (
        <FieldCard field={field}>
          <input
            name={field.id}
            required={field.required}
            className="w-full rounded-md border border-royal-200 px-3 py-2 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          />
        </FieldCard>
      );
    case "long-text":
      return (
        <FieldCard field={field}>
          <textarea
            name={field.id}
            required={field.required}
            rows={3}
            className="w-full rounded-md border border-royal-200 px-3 py-2 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          />
        </FieldCard>
      );
    case "number":
      return (
        <FieldCard field={field}>
          <input
            type="number"
            name={field.id}
            required={field.required}
            min={field.min}
            max={field.max}
            className="w-40 rounded-md border border-royal-200 px-3 py-2 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          />
        </FieldCard>
      );
    case "email":
      return (
        <FieldCard field={field}>
          <input
            type="email"
            name={field.id}
            required={field.required}
            placeholder="name@example.com"
            className="w-full rounded-md border border-royal-200 px-3 py-2 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          />
        </FieldCard>
      );
    case "phone":
      return (
        <FieldCard field={field}>
          <input
            type="tel"
            name={field.id}
            required={field.required}
            placeholder="+1 555 000 1234"
            className="w-full rounded-md border border-royal-200 px-3 py-2 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          />
        </FieldCard>
      );
    case "link":
      return (
        <FieldCard field={field}>
          <input
            type="url"
            name={field.id}
            required={field.required}
            placeholder="https://instagram.com/yourhandle"
            className="w-full rounded-md border border-royal-200 px-3 py-2 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          />
        </FieldCard>
      );
    case "date":
      return (
        <FieldCard field={field}>
          <input
            type="date"
            name={field.id}
            required={field.required}
            min={field.min}
            max={field.max}
            className="w-48 rounded-md border border-royal-200 px-3 py-2 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          />
        </FieldCard>
      );
    case "photo":
      return (
        <FieldCard field={field}>
          <PhotoUploadInput name={field.id} required={field.required} />
        </FieldCard>
      );
    case "document":
      return (
        <FieldCard field={field}>
          <DocumentUploadInput name={field.id} required={field.required} />
        </FieldCard>
      );
    case "code":
      return (
        <FieldCard field={field}>
          <CodeFieldInput field={field} />
        </FieldCard>
      );
    case "signature":
      return (
        <FieldCard field={field}>
          <SignaturePad name={field.id} />
        </FieldCard>
      );
    case "drawing":
      return (
        <FieldCard field={field}>
          <DrawingPad name={field.id} />
        </FieldCard>
      );
    case "design-board":
      return (
        <FieldCard field={field}>
          <DesignBoardInput field={field} />
        </FieldCard>
      );
    case "dropdown":
      return (
        <FieldCard field={field}>
          <DropdownFieldInput field={field} />
        </FieldCard>
      );
    case "multiple-choice":
      return (
        <FieldCard field={field}>
          <div className="flex flex-col gap-2">
            {field.options.map((option, i) => (
              <label
                key={i}
                className="flex items-center gap-2 text-sm text-royal-800"
              >
                <input
                  type="radio"
                  name={field.id}
                  value={option}
                  required={field.required}
                />
                {option}
              </label>
            ))}
          </div>
        </FieldCard>
      );
    case "checkbox":
      return (
        <FieldCard field={field}>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-royal-800">
              <input
                type="radio"
                name={field.id}
                value={field.yesLabel}
                required={field.required}
              />
              {field.yesLabel}
            </label>
            <label className="flex items-center gap-2 text-sm text-royal-800">
              <input type="radio" name={field.id} value={field.noLabel} />
              {field.noLabel}
            </label>
          </div>
        </FieldCard>
      );
    case "rating":
      return (
        <FieldCard field={field}>
          {field.style === "stars" ? (
            <StarRatingInput name={field.id} max={field.max} />
          ) : (
            <SliderRatingInput
              name={field.id}
              min={field.min}
              max={field.max}
            />
          )}
        </FieldCard>
      );
    case "computed":
      return field.showOnForm ? (
        <FieldCard field={field}>
          <ComputedFieldDisplay field={field} />
        </FieldCard>
      ) : (
        <div className="hidden">
          <ComputedFieldDisplay field={field} />
        </div>
      );
    case "player-list":
      return <PlayerListRenderer field={field} />;
    case "button":
      return <ButtonFieldRenderer field={field} />;
    case "static-text":
      return <StaticTextRenderer field={field} />;
    case "image-display":
      return <ImageDisplayRenderer field={field} />;
    case "checklist":
      return (
        <FieldCard field={field}>
          <ChecklistFieldInput field={field} />
        </FieldCard>
      );
    case "ranking":
      return (
        <FieldCard field={field}>
          <RankingFieldInput field={field} />
        </FieldCard>
      );
    case "section-break":
      return null;
  }
}

function StarRatingInput({ name, max }: { name: string; max: number }) {
  const count = Math.max(1, Math.min(max, 10));
  const [value, setValue] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const display = hovered ?? value;
  const hiddenRef = useRef<HTMLInputElement>(null);

  // The hidden input's value is set by React, not real typing, so it never
  // fires a native "input" event on its own — dispatch one manually so any
  // Computed field listening for changes on this field (by name) still
  // reacts, the same way it would to a real text/range input.
  useEffect(() => {
    hiddenRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [value]);

  // A native form reset only resets real HTML controls — it has no idea
  // this React state exists, so without this the stars would stay filled
  // in after clicking "Clear."
  useEffect(() => {
    const formEl = hiddenRef.current?.closest("form");
    if (!formEl) return;
    const handleReset = () => setValue(0);
    formEl.addEventListener("reset", handleReset);
    return () => formEl.removeEventListener("reset", handleReset);
  }, []);

  return (
    <div className="flex items-center gap-1">
      <input
        ref={hiddenRef}
        type="hidden"
        name={name}
        value={value || ""}
        readOnly
      />
      {Array.from({ length: count }).map((_, i) => {
        const starValue = i + 1;
        const filled = starValue <= display;
        return (
          <button
            key={i}
            type="button"
            onClick={() => setValue(starValue === value ? 0 : starValue)}
            onMouseEnter={() => setHovered(starValue)}
            onMouseLeave={() => setHovered(null)}
            className={`transition-colors ${filled ? "text-royal-500" : "text-royal-300"} hover:text-royal-500`}
            aria-label={`${starValue} out of ${count}`}
          >
            <Star size={24} fill={filled ? "currentColor" : "none"} />
          </button>
        );
      })}
      {value > 0 && (
        <span className="ml-2 text-xs text-royal-400">
          {value} / {count}
        </span>
      )}
    </div>
  );
}

function SliderRatingInput({
  name,
  min,
  max,
}: {
  name: string;
  min: number;
  max: number;
}) {
  const [value, setValue] = useState(min);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const formEl = inputRef.current?.closest("form");
    if (!formEl) return;
    const handleReset = () => setValue(min);
    formEl.addEventListener("reset", handleReset);
    return () => formEl.removeEventListener("reset", handleReset);
  }, [min]);

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="range"
        name={name}
        min={min}
        max={max}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-full max-w-xs accent-royal-600"
      />
      <span className="w-10 text-center text-sm font-medium text-royal-700">
        {value}
      </span>
    </div>
  );
}

function ComputedFieldDisplay({
  field,
}: {
  field: Extract<FormField, { type: "computed" }>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState(0);

  useEffect(() => {
    const formEl = containerRef.current?.closest("form");
    if (!formEl) return;

    function recompute() {
      const values = field.terms.map((term) => {
        if (term.type === "constant") return term.value;
        const el = formEl!.querySelector(
          `[name="${term.fieldId}"]`,
        ) as HTMLInputElement | null;
        const num = el ? parseFloat(el.value) : NaN;
        return Number.isFinite(num) ? num : 0;
      });
      setResult(applyOperation(field.operation, values));
    }

    recompute();
    const listenTo = field.terms
      .filter((t) => t.type === "field")
      .map((t) => formEl!.querySelector(`[name="${t.fieldId}"]`))
      .filter((el): el is Element => el !== null);
    listenTo.forEach((el) => el.addEventListener("input", recompute));

    // On a native form reset, the referenced controls' values are only
    // guaranteed to be back at their defaults *after* this event finishes
    // dispatching — recompute on the next tick rather than reading stale
    // values synchronously here.
    function handleFormReset() {
      setTimeout(recompute, 0);
    }
    formEl.addEventListener("reset", handleFormReset);

    return () => {
      listenTo.forEach((el) => el.removeEventListener("input", recompute));
      formEl.removeEventListener("reset", handleFormReset);
    };
  }, [field]);

  // Propagate to any Computed field chained onto this one, same trick as
  // the star rating's hidden input.
  useEffect(() => {
    hiddenRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [result]);

  return (
    <div ref={containerRef}>
      <input
        ref={hiddenRef}
        type="hidden"
        name={field.id}
        value={formatComputedResult(result)}
        readOnly
      />
      <div className="rounded-md border border-royal-200 bg-royal-50/60 px-4 py-3 text-lg font-semibold text-royal-950">
        {formatComputedResult(result)}
      </div>
    </div>
  );
}

function ChecklistFieldInput({
  field,
}: {
  field: Extract<FormField, { type: "checklist" }>;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const hiddenRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // A single joined summary, kept in one hidden input named after the
  // field itself — this is what actually gets recorded (Sheets column,
  // local-storage answer, the Review screen), so this field needs no
  // special-case handling anywhere else, the same generic "read
  // formData.get(field.id)" path every simple field already goes through.
  const summary = field.items
    .map((item) => `${item.label || "Untitled"}: ${checked[item.id] ? "Yes" : "No"}`)
    .join(", ");

  useEffect(() => {
    hiddenRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [summary]);

  useEffect(() => {
    const formEl = containerRef.current?.closest("form");
    if (!formEl) return;
    const handleReset = () => setChecked({});
    formEl.addEventListener("reset", handleReset);
    return () => formEl.removeEventListener("reset", handleReset);
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      <input ref={hiddenRef} type="hidden" name={field.id} value={summary} readOnly />
      {field.items.map((item) => (
        <label
          key={item.id}
          className="flex items-start gap-2 text-sm text-royal-800"
        >
          <input
            type="checkbox"
            required={item.required}
            checked={checked[item.id] ?? false}
            onChange={(e) =>
              setChecked((prev) => ({ ...prev, [item.id]: e.target.checked }))
            }
            className="mt-0.5 h-4 w-4 rounded border-royal-300"
          />
          <span>
            {item.label}
            {item.required && <span className="ml-0.5 text-red-500">*</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

function RankingFieldInput({
  field,
}: {
  field: Extract<FormField, { type: "ranking" }>;
}) {
  const [order, setOrder] = useState<string[]>(() => field.items.map((item) => item.id));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; label: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  // Native validation ignores type="hidden" inputs entirely (they're
  // barred from constraint validation) — this visually-hidden-but-still-
  // focusable text input is the real anchor for the "please drag these
  // into an order" message, same role as Dropdown's anchor checkbox.
  const requiredAnchorRef = useRef<HTMLInputElement>(null);

  const itemsById = useMemo(
    () => new Map(field.items.map((item) => [item.id, item])),
    [field.items],
  );

  // A single joined summary, same generic "read formData.get(field.id)"
  // path every simple field already goes through (see Checklist).
  const summary = order
    .map((id, i) => `${i + 1}. ${itemsById.get(id)?.label || "Untitled"}`)
    .join(", ");

  useEffect(() => {
    hiddenRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [summary]);

  useEffect(() => {
    const formEl = containerRef.current?.closest("form");
    if (!formEl) return;
    const handleReset = () => {
      setOrder(field.items.map((item) => item.id));
      setHasInteracted(false);
    };
    formEl.addEventListener("reset", handleReset);
    return () => formEl.removeEventListener("reset", handleReset);
  }, [field.items]);

  useEffect(() => {
    const el = requiredAnchorRef.current;
    if (!el) return;
    el.setCustomValidity(
      field.required && !hasInteracted
        ? "Please drag these into an order before submitting."
        : "",
    );
  }, [field.required, hasInteracted]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
    setHasInteracted(true);
  }

  const horizontal = field.layout === "horizontal";
  const activeItem = activeId ? itemsById.get(activeId) ?? null : null;

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      <input ref={hiddenRef} type="hidden" name={field.id} value={summary} readOnly />
      <input
        ref={requiredAnchorRef}
        type="text"
        readOnly
        value={hasInteracted ? "ok" : ""}
        aria-hidden="true"
        tabIndex={-1}
        className="absolute h-0 w-0 opacity-0"
      />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext
          items={order}
          strategy={horizontal ? horizontalListSortingStrategy : verticalListSortingStrategy}
        >
          <div className={horizontal ? "flex flex-wrap gap-2" : "flex flex-col gap-2"}>
            {order.map((id, i) => {
              const item = itemsById.get(id);
              if (!item) return null;
              return (
                <RankingItemRow
                  key={id}
                  id={id}
                  index={i}
                  item={item}
                  horizontal={horizontal}
                  onZoomImage={(url, label) => setZoomedImage({ url, label })}
                />
              );
            })}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeItem ? (
            <RankingItemRow
              id={activeItem.id}
              index={order.indexOf(activeItem.id)}
              item={activeItem}
              horizontal={horizontal}
              overlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>
      <ImageZoomModal
        image={zoomedImage ? { url: zoomedImage.url, alt: zoomedImage.label } : null}
        onClose={() => setZoomedImage(null)}
      />
    </div>
  );
}

function RankingItemRow({
  id,
  index,
  item,
  horizontal,
  overlay,
  onZoomImage,
}: {
  id: string;
  index: number;
  item: RankingItem;
  horizontal: boolean;
  overlay?: boolean;
  onZoomImage?: (url: string, label: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={overlay ? undefined : { transform: CSS.Transform.toString(transform), transition }}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      className={`flex items-center gap-2 rounded-md border border-royal-200 bg-white px-3 py-2 text-sm text-royal-800 shadow-sm ${
        !overlay && isDragging ? "opacity-40" : ""
      } ${horizontal ? "" : "w-full"} cursor-grab touch-none select-none active:cursor-grabbing`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-royal-100 text-[11px] font-semibold text-royal-700">
        {index + 1}
      </span>
      {item.imageDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageDataUrl}
          alt=""
          onClick={(e) => {
            // Clicking the image zooms it instead of starting a drag —
            // stop it from bubbling to the row's drag listeners.
            e.preventDefault();
            e.stopPropagation();
            onZoomImage?.(item.imageDataUrl!, item.label);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="h-8 w-8 shrink-0 cursor-zoom-in rounded object-cover"
        />
      )}
      {item.label && <span>{item.label}</span>}
      <GripVertical size={14} className="ml-auto shrink-0 text-royal-300" />
    </div>
  );
}

const PHOTO_MIME_TYPES = ["image/png", "image/jpeg"];
const FILE_TOO_LARGE = `This file is larger than ${MAX_UPLOAD_LABEL}. Please choose a smaller one.`;

function PhotoUploadInput({
  required,
  name,
}: {
  required: boolean;
  name?: string;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const checkUploadFit = useUploadFitCheck();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setFileName(null);
      setError(null);
      return;
    }
    if (!PHOTO_MIME_TYPES.includes(file.type)) {
      setError("Please upload a PNG or JPEG photo.");
      setFileName(null);
      e.target.value = "";
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(FILE_TOO_LARGE);
      setFileName(null);
      e.target.value = "";
      return;
    }
    setError(null);
    setFileName(file.name);
    checkUploadFit(e.target, file, (message) => {
      setFileName(null);
      setError(message);
    });
  }

  // The browser does clear the file input itself on reset, but our
  // "Uploaded: ..." label is separate React state that doesn't know that
  // happened unless we're told explicitly.
  useEffect(() => {
    const formEl = inputRef.current?.closest("form");
    if (!formEl) return;
    const handleReset = () => {
      setFileName(null);
      setError(null);
    };
    formEl.addEventListener("reset", handleReset);
    return () => formEl.removeEventListener("reset", handleReset);
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-royal-300 bg-royal-50/40 px-4 py-6 text-royal-500 transition-colors hover:bg-royal-50">
        <Image size={18} />
        <span className="text-sm">
          {fileName ? "Click to replace photo" : "Click to upload a photo"}
        </span>
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept="image/png,image/jpeg"
          required={required}
          onChange={handleChange}
          className="hidden"
        />
      </label>
      {fileName && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-green-600">
          <Check size={12} />
          Uploaded: {fileName}
        </p>
      )}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

function DocumentUploadInput({
  required,
  name,
}: {
  required: boolean;
  name?: string;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const checkUploadFit = useUploadFitCheck();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && file.size > MAX_UPLOAD_BYTES) {
      setError(FILE_TOO_LARGE);
      setFileName(null);
      e.target.value = "";
      return;
    }
    setError(null);
    setFileName(file?.name ?? null);
    if (file) {
      checkUploadFit(e.target, file, (message) => {
        setFileName(null);
        setError(message);
      });
    }
  }

  useEffect(() => {
    const formEl = inputRef.current?.closest("form");
    if (!formEl) return;
    const handleReset = () => {
      setFileName(null);
      setError(null);
    };
    formEl.addEventListener("reset", handleReset);
    return () => formEl.removeEventListener("reset", handleReset);
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-royal-300 bg-royal-50/40 px-4 py-6 text-royal-500 transition-colors hover:bg-royal-50">
        <FileText size={18} />
        <span className="text-sm">
          {fileName ? "Click to replace document" : "Click to upload a document"}
        </span>
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept=".pdf,.doc,.docx"
          required={required}
          onChange={handleChange}
          className="hidden"
        />
      </label>
      {fileName && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-green-600">
          <Check size={12} />
          Uploaded: {fileName}
        </p>
      )}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

function CodeFieldInput({
  field,
}: {
  field: Extract<FormField, { type: "code" }>;
}) {
  const [language, setLanguage] = useState(field.languages[0] ?? "");

  // Plain tab insertion instead of moving focus — without this, Tab just
  // jumps to the next form field, which makes indenting code impossible.
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart, selectionEnd, value } = el;
    el.value = value.slice(0, selectionStart) + "\t" + value.slice(selectionEnd);
    el.selectionStart = el.selectionEnd = selectionStart + 1;
  }

  return (
    <div className="flex flex-col gap-2">
      {field.languages.length > 1 ? (
        <select
          name={`${field.id}__language`}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-48 rounded-md border border-royal-200 px-3 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
        >
          {field.languages.map((id) => (
            <option key={id} value={id}>
              {codeLanguageLabel(id)}
            </option>
          ))}
        </select>
      ) : field.languages.length === 1 ? (
        <>
          <span className="w-fit rounded-full bg-royal-100 px-3 py-1 text-xs font-medium text-royal-700">
            {codeLanguageLabel(field.languages[0])}
          </span>
          <input type="hidden" name={`${field.id}__language`} value={field.languages[0]} readOnly />
        </>
      ) : null}
      <textarea
        name={field.id}
        required={field.required}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        rows={10}
        placeholder="// Write your code here"
        className="w-full rounded-md border border-royal-200 bg-royal-950/[0.02] px-3 py-2 font-mono text-sm leading-relaxed text-royal-950 focus:border-royal-500 focus:outline-none"
      />
    </div>
  );
}

const DROPDOWN_OTHER_VALUE = "__other__";

function DropdownFieldInput({ field }: { field: DropdownField }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; label: string } | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  // Native checkboxes have no "at least N of this group" constraint —
  // this carries a custom validity message on the first checkbox so
  // reportValidity() still blocks submission (and shows a real message)
  // until enough are checked, the same way any other required field does.
  const minCheckRef = useRef<HTMLInputElement>(null);
  const showOther = field.allowOther && selected.includes(DROPDOWN_OTHER_VALUE);
  const options = field.options.map(normalizeDropdownOption);
  // A native <select> can't render images inside its <option>s at all (a
  // hard HTML limitation, not a styling one) — so once any option has one,
  // single-select switches to a styled radio list that can show them,
  // instead of staying a compact native dropdown.
  const hasImages = options.some((o) => o.imageDataUrl);

  useEffect(() => {
    const formEl = containerRef.current?.closest("form");
    if (!formEl) return;
    const handleReset = () => setSelected([]);
    formEl.addEventListener("reset", handleReset);
    return () => formEl.removeEventListener("reset", handleReset);
  }, []);

  const min = field.minSelections;
  useEffect(() => {
    const el = minCheckRef.current;
    if (!el) return;
    el.setCustomValidity(
      min && selected.length < min
        ? `Please select at least ${min} option${min === 1 ? "" : "s"}.`
        : "",
    );
  }, [min, selected.length]);

  const limit = field.maxSelections;
  const limitReached = !!limit && selected.length >= limit;

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      {field.allowMultiple ? (
        <div className="flex flex-col gap-2">
          {(!!limit || !!min) && (
            <p className="text-xs font-medium text-royal-400">
              {min && limit
                ? `Choose between ${min} and ${limit}`
                : min
                  ? `Choose at least ${min}`
                  : `Choose up to ${limit}`}
              {" — "}
              {selected.length} selected
            </p>
          )}
          {options.map((option, i) => {
            const checked = selected.includes(option.label);
            return (
              <label
                key={i}
                className={`flex items-center gap-2 text-sm ${
                  !checked && limitReached ? "text-royal-300" : "text-royal-800"
                }`}
              >
                <input
                  ref={i === 0 ? minCheckRef : undefined}
                  type="checkbox"
                  name={field.id}
                  value={option.label}
                  checked={checked}
                  disabled={!checked && limitReached}
                  className="h-4 w-4 rounded border-royal-300"
                  onChange={(e) =>
                    setSelected((prev) =>
                      e.target.checked
                        ? [...prev, option.label]
                        : prev.filter((v) => v !== option.label),
                    )
                  }
                />
                {option.imageDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={option.imageDataUrl}
                    alt=""
                    onClick={(e) => {
                      // Clicking anywhere inside a <label> (including this
                      // image) normally also toggles its checkbox/radio —
                      // stop that so zooming the image doesn't also change
                      // the answer.
                      e.preventDefault();
                      e.stopPropagation();
                      setZoomedImage({ url: option.imageDataUrl!, label: option.label });
                    }}
                    className="h-8 w-8 shrink-0 cursor-zoom-in rounded object-cover"
                  />
                )}
                {option.label}
              </label>
            );
          })}
          {field.allowOther && (
            <label
              className={`flex items-center gap-2 text-sm ${
                !selected.includes(DROPDOWN_OTHER_VALUE) && limitReached
                  ? "text-royal-300"
                  : "text-royal-800"
              }`}
            >
              <input
                type="checkbox"
                name={field.id}
                value={DROPDOWN_OTHER_VALUE}
                checked={selected.includes(DROPDOWN_OTHER_VALUE)}
                disabled={!selected.includes(DROPDOWN_OTHER_VALUE) && limitReached}
                className="h-4 w-4 rounded border-royal-300"
                onChange={(e) =>
                  setSelected((prev) =>
                    e.target.checked
                      ? [...prev, DROPDOWN_OTHER_VALUE]
                      : prev.filter((v) => v !== DROPDOWN_OTHER_VALUE),
                  )
                }
              />
              Other
            </label>
          )}
        </div>
      ) : hasImages ? (
        <div className="flex flex-col gap-2">
          {options.map((option, i) => (
            <label
              key={i}
              className="flex items-center gap-2 text-sm text-royal-800"
            >
              <input
                type="radio"
                name={field.id}
                value={option.label}
                required={field.required}
                onChange={() => setSelected([option.label])}
                className="h-4 w-4"
              />
              {option.imageDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={option.imageDataUrl}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded object-cover"
                />
              )}
              {option.label}
            </label>
          ))}
          {field.allowOther && (
            <label className="flex items-center gap-2 text-sm text-royal-800">
              <input
                type="radio"
                name={field.id}
                value={DROPDOWN_OTHER_VALUE}
                required={field.required}
                onChange={() => setSelected([DROPDOWN_OTHER_VALUE])}
                className="h-4 w-4"
              />
              Other
            </label>
          )}
        </div>
      ) : (
        <select
          name={field.id}
          required={field.required}
          defaultValue=""
          className="w-full rounded-md border border-royal-200 px-3 py-2 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          onChange={(e) => setSelected(e.target.value ? [e.target.value] : [])}
        >
          <option value="" disabled>
            Select...
          </option>
          {options.map((option, i) => (
            <option key={i}>{option.label}</option>
          ))}
          {field.allowOther && (
            <option value={DROPDOWN_OTHER_VALUE}>Other</option>
          )}
        </select>
      )}
      {showOther && (
        <input
          type="text"
          name={`${field.id}__other`}
          required={field.required}
          placeholder="Please specify"
          className="w-full rounded-md border border-royal-200 px-3 py-2 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
        />
      )}

      <ImageZoomModal
        image={zoomedImage ? { url: zoomedImage.url, alt: zoomedImage.label } : null}
        onClose={() => setZoomedImage(null)}
      />
    </div>
  );
}

function CompactPhotoUpload({
  name,
  required,
}: {
  name: string;
  required: boolean;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const checkUploadFit = useUploadFitCheck();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setFileName(null);
      setError(null);
      return;
    }
    if (!PHOTO_MIME_TYPES.includes(file.type)) {
      setError("PNG or JPEG only");
      setFileName(null);
      e.target.value = "";
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`Max ${MAX_UPLOAD_LABEL}`);
      setFileName(null);
      e.target.value = "";
      return;
    }
    setError(null);
    setFileName(file.name);
    checkUploadFit(e.target, file, () => {
      setFileName(null);
      setError("Not enough storage");
    });
  }

  useEffect(() => {
    const formEl = inputRef.current?.closest("form");
    if (!formEl) return;
    const handleReset = () => {
      setFileName(null);
      setError(null);
    };
    formEl.addEventListener("reset", handleReset);
    return () => formEl.removeEventListener("reset", handleReset);
  }, []);

  return (
    <div className="flex flex-col gap-1">
      <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-royal-300 bg-royal-50/40 px-2.5 py-1.5 text-royal-500 transition-colors hover:bg-royal-50">
        <Image size={14} />
        <span className="max-w-[90px] truncate text-xs">
          {fileName ?? "Upload"}
        </span>
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept="image/png,image/jpeg"
          required={required}
          onChange={handleChange}
          className="hidden"
        />
      </label>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}

function PlayerListRenderer({
  field,
}: {
  field: Extract<FormField, { type: "player-list" }>;
}) {
  return (
    <div className="rounded-xl border border-royal-100 bg-white p-5 shadow-sm">
      <p className="mb-4 text-sm font-medium text-royal-950">
        {field.label || "Untitled question"}
        {field.required && <span className="ml-0.5 text-red-500">*</span>}
      </p>

      {field.columns.length === 0 ? (
        <p className="text-sm text-royal-400">No fields configured.</p>
      ) : field.layout === "row" ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="bg-royal-50">
                {field.columns.map((column) => (
                  <th
                    key={column.id}
                    className="whitespace-nowrap px-3 py-2 text-left font-medium text-royal-700"
                  >
                    {column.label}
                    {column.required && (
                      <span className="ml-0.5 text-red-500">*</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: field.playerCount }).map((_, i) => (
                <tr key={i} className="border-t border-royal-100">
                  {field.columns.map((column) => (
                    <td key={column.id} className="px-3 py-2">
                      <PlayerColumnInput
                        column={column}
                        name={`player-${i}-${column.id}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {Array.from({ length: field.playerCount }).map((_, i) => (
            <div key={i} className="rounded-lg border border-royal-100 p-3">
              <p className="mb-2 text-xs font-semibold text-royal-500">
                Entry {i + 1}
              </p>
              <div className="flex flex-col gap-2">
                {field.columns.map((column) => (
                  <div key={column.id} className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-royal-600">
                      {column.label}
                      {column.required && (
                        <span className="ml-0.5 text-red-500">*</span>
                      )}
                    </label>
                    <PlayerColumnInput
                      column={column}
                      name={`player-${i}-${column.id}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerColumnInput({
  column,
  name,
}: {
  column: PlayerListColumn;
  name: string;
}) {
  switch (column.type) {
    case "short-text":
      return (
        <input
          name={name}
          required={column.required}
          className="w-full min-w-[120px] rounded-md border border-royal-200 px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
        />
      );
    case "number":
      return (
        <input
          type="number"
          name={name}
          required={column.required}
          className="w-24 rounded-md border border-royal-200 px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
        />
      );
    case "dropdown":
      return (
        <select
          name={name}
          required={column.required}
          defaultValue=""
          className="w-full min-w-[120px] rounded-md border border-royal-200 px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
        >
          <option value="" disabled>
            Select...
          </option>
          {(column.options ?? []).map((option, i) => (
            <option key={i}>{option}</option>
          ))}
        </select>
      );
    case "checkbox":
      return (
        <div className="flex items-center gap-4 text-sm text-royal-800">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name={name}
              value="Yes"
              required={column.required}
            />
            Yes
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name={name} value="No" />
            No
          </label>
        </div>
      );
    case "photo":
      return <CompactPhotoUpload name={name} required={column.required} />;
  }
}

function StaticTextRenderer({
  field,
}: {
  field: Extract<FormField, { type: "static-text" }>;
}) {
  const [zoomed, setZoomed] = useState<{ url: string; alt: string } | null>(null);
  if (!field.content && !field.imageDataUrl) return null;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-royal-100 bg-royal-50/60 p-5">
      {field.imageDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={field.imageDataUrl}
          alt=""
          onClick={() => setZoomed({ url: field.imageDataUrl!, alt: "" })}
          className="max-h-96 w-full cursor-zoom-in rounded-lg object-contain"
        />
      )}
      {field.content && (
        <MarkdownContent content={field.content} color={field.color} />
      )}
      <ImageZoomModal image={zoomed} onClose={() => setZoomed(null)} />
    </div>
  );
}

function ImageDisplayRenderer({
  field,
}: {
  field: Extract<FormField, { type: "image-display" }>;
}) {
  const [zoomed, setZoomed] = useState<{ url: string; alt: string } | null>(null);
  if (!field.imageDataUrl) return null;
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-royal-100 bg-white p-5 shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={field.imageDataUrl}
        alt={field.caption ?? ""}
        onClick={() =>
          setZoomed({ url: field.imageDataUrl!, alt: field.caption ?? "" })
        }
        className="max-h-96 w-full cursor-zoom-in rounded-lg object-contain"
      />
      {field.caption && (
        <p className="text-center text-sm text-royal-500">{field.caption}</p>
      )}
      <ImageZoomModal image={zoomed} onClose={() => setZoomed(null)} />
    </div>
  );
}

function ButtonFieldRenderer({
  field,
}: {
  field: Extract<FormField, { type: "button" }>;
}) {
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState<{ url: string; alt: string } | null>(null);
  // "Committed" is what actually gets submitted with the form — it only
  // ever changes on an explicit Save (or Reset) click, never just from
  // typing in the popup. "Draft" is the popup's own working copy, seeded
  // from committed each time it opens and thrown away on Close/backdrop
  // click without ever touching committed.
  const [committedValues, setCommittedValues] = useState<Record<string, string>>({});
  const [committedFiles, setCommittedFiles] = useState<Record<string, File | null>>({});
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [draftFiles, setDraftFiles] = useState<Record<string, File | null>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const rootRef = useRef<HTMLDivElement>(null);

  const answered = field.fields.some((column) =>
    column.type === "photo"
      ? !!committedFiles[column.id]
      : !!committedValues[column.id],
  );

  function openModal() {
    setDraftValues(committedValues);
    setDraftFiles(committedFiles);
    setOpen(true);
  }

  function saveDraft() {
    setCommittedValues(draftValues);
    setCommittedFiles(draftFiles);
    for (const column of field.fields) {
      if (column.type !== "photo") continue;
      const input = fileInputRefs.current[column.id];
      if (!input) continue;
      const file = draftFiles[column.id];
      if (file) {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
      } else {
        input.value = "";
      }
    }
    setOpen(false);
  }

  function resetAnswers() {
    setCommittedValues({});
    setCommittedFiles({});
    setDraftValues({});
    setDraftFiles({});
    for (const column of field.fields) {
      if (column.type !== "photo") continue;
      const input = fileInputRefs.current[column.id];
      if (input) input.value = "";
    }
  }

  useEffect(() => {
    const formEl = rootRef.current?.closest("form");
    if (!formEl) return;
    const handleReset = () => {
      setCommittedValues({});
      setCommittedFiles({});
      setDraftValues({});
      setDraftFiles({});
      setOpen(false);
    };
    formEl.addEventListener("reset", handleReset);
    return () => formEl.removeEventListener("reset", handleReset);
  }, []);

  return (
    <div ref={rootRef}>
      <FieldCard field={field}>
        <div className="flex flex-col items-start gap-2">
          <button
            type="button"
            onClick={openModal}
            className="rounded-lg transition-opacity hover:opacity-90"
          >
            {field.buttonStyle === "image" && field.buttonImageDataUrl ? (
              <span className="flex flex-col items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={field.buttonImageDataUrl}
                  alt={field.buttonText || ""}
                  className="h-20 w-20 rounded-lg border border-royal-100 object-cover"
                />
                {field.buttonText && (
                  <span className="text-xs font-medium text-royal-600">
                    {field.buttonText}
                  </span>
                )}
              </span>
            ) : (
              <span className="inline-block rounded-full bg-royal-600 px-5 py-2 text-sm font-medium text-white hover:bg-royal-700">
                {field.buttonText || "Click to answer"}
              </span>
            )}
          </button>
          <span
            className={`text-xs font-medium ${
              answered ? "text-green-600" : "text-royal-400"
            }`}
          >
            {answered ? "Answered — tap to edit" : "Not answered yet"}
          </span>
        </div>
      </FieldCard>

      {/* The actual submitted inputs — driven only by committedValues/
          committedFiles, never by what's currently being typed in the
          popup below. */}
      {field.fields.map((column) =>
        column.type === "photo" ? (
          <input
            key={column.id}
            ref={(el) => {
              fileInputRefs.current[column.id] = el;
            }}
            type="file"
            name={`${field.id}__${column.id}`}
            className="hidden"
          />
        ) : (
          <input
            key={column.id}
            type="hidden"
            name={`${field.id}__${column.id}`}
            value={committedValues[column.id] ?? ""}
            readOnly
          />
        ),
      )}

      <div
        className={
          open
            ? "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            : "hidden"
        }
        onClick={() => setOpen(false)}
      >
        <div
          className="relative flex max-h-[85vh] w-full max-w-sm flex-col overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute right-3 top-3 rounded-full p-1.5 text-royal-400 hover:bg-royal-50 hover:text-royal-700"
          >
            <X size={16} />
          </button>
          <h3 className="mb-3 pr-6 text-base font-semibold text-royal-950">
            {field.label || "Untitled question"}
          </h3>
          {field.buttonStyle === "image" && field.buttonImageDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={field.buttonImageDataUrl}
              alt={field.buttonText || ""}
              onClick={() =>
                setZoomed({ url: field.buttonImageDataUrl!, alt: field.buttonText || "" })
              }
              className="mb-3 max-h-48 w-full cursor-zoom-in rounded-lg border border-royal-100 object-contain"
            />
          )}
          <div className="flex flex-col gap-3">
            {field.fields.length === 0 && (
              <p className="text-sm text-royal-400">Nothing to fill in yet.</p>
            )}
            {field.fields.map((column) => (
              <div key={column.id} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-royal-600">
                  {column.label}
                  {column.required && (
                    <span className="ml-0.5 text-red-500">*</span>
                  )}
                </label>
                <DraftColumnInput
                  column={column}
                  value={draftValues[column.id] ?? ""}
                  onValueChange={(v) =>
                    setDraftValues((prev) => ({ ...prev, [column.id]: v }))
                  }
                  file={draftFiles[column.id] ?? null}
                  onFileChange={(f) =>
                    setDraftFiles((prev) => ({ ...prev, [column.id]: f }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={resetAnswers}
              className="text-xs font-medium text-royal-400 hover:text-red-600"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={saveDraft}
              className="rounded-full bg-royal-600 px-5 py-2 text-sm font-medium text-white hover:bg-royal-700"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      <ImageZoomModal image={zoomed} onClose={() => setZoomed(null)} />
    </div>
  );
}

function DraftColumnInput({
  column,
  value,
  onValueChange,
  file,
  onFileChange,
}: {
  column: PlayerListColumn;
  value: string;
  onValueChange: (value: string) => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
}) {
  switch (column.type) {
    case "short-text":
      return (
        <input
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className="w-full min-w-0 rounded-md border border-royal-200 px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className="w-full rounded-md border border-royal-200 px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
        />
      );
    case "dropdown":
      return (
        <select
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className="w-full rounded-md border border-royal-200 px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
        >
          <option value="" disabled>
            Select...
          </option>
          {(column.options ?? []).map((option, i) => (
            <option key={i} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case "checkbox":
      return (
        <div className="flex items-center gap-4 text-sm text-royal-800">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={value === "Yes"}
              onChange={() => onValueChange("Yes")}
            />
            Yes
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={value === "No"}
              onChange={() => onValueChange("No")}
            />
            No
          </label>
        </div>
      );
    case "photo":
      return (
        <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-royal-300 bg-royal-50/40 px-2.5 py-1.5 text-royal-500 transition-colors hover:bg-royal-50">
          <Image size={14} />
          <span className="max-w-[200px] truncate text-xs">
            {file ? file.name : "Upload"}
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          />
        </label>
      );
  }
}
