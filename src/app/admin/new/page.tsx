"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ArrowLeft, Palette, Check, Copy, PanelLeftClose, PanelLeftOpen, Cloud, HardDrive, X } from "lucide-react";
import { createField, getFieldTypeDef, type FieldTypeDef } from "@/lib/field-types";
import type { FieldType, FormField } from "@/types/form-builder";
import { DEFAULT_THEME, type FormTheme } from "@/types/theme";
import { DEFAULT_CLOSING, type FormClosing } from "@/types/closing";
import { FieldPalette } from "@/components/builder/FieldPalette";
import { FormCanvas } from "@/components/builder/FormCanvas";
import { FormRenderer } from "@/components/form/FormRenderer";
import { DesignStep } from "@/components/design/DesignStep";
import { PageBackground } from "@/components/design/PageBackground";
import { UserMenu } from "@/components/UserMenu";
import { saveDraft, loadDraft, clearDraft } from "@/lib/draft";
import {
  createDraft,
  publishForm,
  loadForm,
  updateDraft,
  updateLiveForm,
  setMaintenanceMode,
  type StorageChoice,
  type AccessCodeSummary,
} from "@/lib/form-actions";
import { getMyStorage, type MyStorage } from "@/lib/storage-actions";
import { formatBytes } from "@/lib/storage-limits";

type ActiveDrag =
  | { kind: "palette"; def: FieldTypeDef }
  | { kind: "field"; field: FormField }
  | null;

const PALETTE_WIDTH_STORAGE_KEY = "codactis:field-palette-width";
const PALETTE_MIN_WIDTH = 200;
const PALETTE_MAX_WIDTH = 480;
const PALETTE_DEFAULT_WIDTH = 240; // matches the old fixed 240px column

const STORAGE_FULL_ADMIN_MESSAGE =
  "Not enough storage for these images. Remove some images, delete old responses on Manage forms, or contact Codactics Support (chat button, bottom right) for more space — your other changes aren't saved until then.";

export default function NewFormPage() {
  return (
    <Suspense fallback={null}>
      <NewFormPageInner />
    </Suspense>
  );
}

function NewFormPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formId = searchParams.get("formId");
  const { status: sessionStatus } = useSession();

  const [paletteOpen, setPaletteOpen] = useState(true);

  // How wide the "Add a field" palette is — draggable via a handle that's
  // a sibling of the palette, not nested inside its own overflow-y-auto
  // scroll box (which would otherwise silently clip anything positioned
  // past its edge — see the same fix on the Design step's sidebar).
  const [paletteWidth, setPaletteWidth] = useState(PALETTE_DEFAULT_WIDTH);
  const paletteResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(PALETTE_WIDTH_STORAGE_KEY);
    const parsed = stored ? Number(stored) : NaN;
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(PALETTE_MAX_WIDTH, Math.max(PALETTE_MIN_WIDTH, parsed));
    // Deferred a tick rather than set synchronously in the effect body.
    const timer = setTimeout(() => setPaletteWidth(clamped), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PALETTE_WIDTH_STORAGE_KEY, String(paletteWidth));
  }, [paletteWidth]);

  function handlePaletteResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    paletteResizeRef.current = { startX: e.clientX, startWidth: paletteWidth };
  }

  function handlePaletteResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!paletteResizeRef.current) return;
    const next = paletteResizeRef.current.startWidth + (e.clientX - paletteResizeRef.current.startX);
    setPaletteWidth(Math.min(PALETTE_MAX_WIDTH, Math.max(PALETTE_MIN_WIDTH, next)));
  }

  function handlePaletteResizePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    paletteResizeRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }
  const [formTitle, setFormTitle] = useState("Untitled form");
  const [theme, setTheme] = useState<FormTheme>(DEFAULT_THEME);
  const [closing, setClosing] = useState<FormClosing>(DEFAULT_CLOSING);
  const [requireAccessCode, setRequireAccessCode] = useState(false);
  const [accessUsernames, setAccessUsernames] = useState<string[]>([]);
  const [accessCodes, setAccessCodes] = useState<AccessCodeSummary[]>([]);
  const [loginLimitFeatureEnabled, setLoginLimitFeatureEnabled] = useState(false);
  const [flowStep, setFlowStep] = useState<"design" | "build">("design");
  const [fields, setFields] = useState<FormField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null);
  const [insertionTargetId, setInsertionTargetId] = useState<string | null>(
    null,
  );
  const [publishState, setPublishState] = useState<
    "idle" | "publishing" | "done" | "error"
  >("idle");
  const [showStorageChoice, setShowStorageChoice] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [formStatus, setFormStatus] = useState<
    "draft" | "published" | "maintenance" | null
  >(null);
  const [isHydrated, setIsHydrated] = useState(!formId);
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [maintenancePending, setMaintenancePending] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If we were opened against an existing saved draft (from Home or Manage
  // Forms), load its data from the database instead of starting blank.
  useEffect(() => {
    if (!formId) return;
    let cancelled = false;
    (async () => {
      const result = await loadForm(formId);
      if (cancelled) return;
      if (!result.ok) {
        router.replace(
          result.error === "not-signed-in"
            ? "/login?callbackUrl=/admin/new"
            : "/admin/forms",
        );
        return;
      }
      setFormTitle(result.title);
      setFields(result.fields);
      setTheme(result.theme);
      setClosing(result.closing);
      setRequireAccessCode(result.requireAccessCode);
      setAccessUsernames(result.accessUsernames);
      setAccessCodes(result.accessCodes);
      setLoginLimitFeatureEnabled(result.loginLimitFeatureEnabled);
      setFormStatus(
        result.status === "published" || result.status === "maintenance"
          ? result.status
          : "draft",
      );
      // Always land on the Design step first, whether this is a brand-new
      // draft or a fully-built published form — consistent and predictable
      // beats guessing which stage the admin wants. "Continue to fields"
      // (or the palette icon once in the builder) moves on from there.
      setFlowStep("design");
      setIsHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [formId, router]);

  // Restore a draft that was saved right before redirecting to sign-in
  // (see handlePublish's "not-signed-in" branch below), if there is one.
  // Only relevant for the no-formId (anonymous-until-publish) flow.
  useEffect(() => {
    if (formId) return;
    const draft = loadDraft();
    if (!draft) return;
    setFormTitle(draft.formTitle);
    setFields(draft.fields);
    setTheme(draft.theme);
    setClosing(draft.closing ?? DEFAULT_CLOSING);
    setFlowStep(draft.flowStep);
    clearDraft();
  }, [formId]);

  // Autosave as the admin edits. Drafts save straight to the database.
  // Already-live forms (published or under maintenance) also sync new
  // fields to the Google Sheet as columns — see updateLiveForm. Anonymous
  // (no formId) editing stays purely client-side, same as before.
  useEffect(() => {
    if (!isHydrated || !formId || !formStatus) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setSavingState("saving");
    autosaveTimer.current = setTimeout(async () => {
      const save = formStatus === "draft" ? updateDraft : updateLiveForm;
      const result = await save(formId, { title: formTitle, fields, theme, closing });
      if (result.ok) {
        if (result.title !== formTitle) setFormTitle(result.title);
        setSavingState("saved");
      } else if (result.error === "storage-full") {
        setPublishState("error");
        setPublishError(STORAGE_FULL_ADMIN_MESSAGE);
      }
    }, 1200);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [isHydrated, formId, formStatus, formTitle, fields, theme, closing]);

  // An anonymously-started form (no formId yet) only ever gets a real row
  // at Publish time — but some settings (access codes) need a form to
  // actually attach to before that. Once sign-in lands (see
  // handleNeedSignIn below) and we're past the localStorage-restore pass,
  // quietly create that row now and adopt its id, instead of waiting.
  const autoCreatingDraft = useRef(false);
  useEffect(() => {
    if (formId || sessionStatus !== "authenticated" || !isHydrated) return;
    if (autoCreatingDraft.current) return;
    autoCreatingDraft.current = true;
    (async () => {
      const created = await createDraft();
      if (!created.ok) return;
      await updateDraft(created.formId, { title: formTitle, fields, theme, closing });
      router.replace(`/admin/new?formId=${created.formId}`);
    })();
  }, [formId, sessionStatus, isHydrated, formTitle, fields, theme, closing, router]);

  function handleNeedSignIn() {
    saveDraft({ formTitle, fields, theme, flowStep, closing });
    router.push("/login?callbackUrl=/admin/new");
  }

  async function handleToggleMaintenance() {
    if (!formId || !formStatus || formStatus === "draft") return;
    setMaintenancePending(true);
    const goingUnderMaintenance = formStatus === "published";
    const result = await setMaintenanceMode(formId, goingUnderMaintenance);
    setMaintenancePending(false);
    if (result.ok) {
      setFormStatus(goingUnderMaintenance ? "maintenance" : "published");
    }
  }

  function handlePublish() {
    // Check sign-in first so the admin only ever picks a storage option
    // once — otherwise they'd choose one, get bounced to sign-in because
    // they weren't authenticated yet, and have to re-choose after
    // returning. sessionStatus can briefly be "loading" right after page
    // load; treat that the same as signed-in and let publishWithStorage's
    // own not-signed-in fallback catch the rare case it turns out wrong.
    if (sessionStatus === "unauthenticated") {
      saveDraft({ formTitle, fields, theme, flowStep, closing });
      router.push("/login?callbackUrl=/admin/new");
      return;
    }
    setShowStorageChoice(true);
  }

  async function publishWithStorage(storage: StorageChoice) {
    setShowStorageChoice(false);
    setPublishState("publishing");
    setPublishError(null);
    const result = await publishForm({
      formId: formId ?? undefined,
      title: formTitle,
      fields,
      theme,
      storage,
      closing,
    });
    if (result.ok) {
      setPublishedSlug(result.slug);
      setPublishState("done");
      setFormStatus("published");
    } else if (result.error === "not-signed-in") {
      saveDraft({ formTitle, fields, theme, flowStep, closing });
      router.push("/login?callbackUrl=/admin/new");
      return;
    } else {
      setPublishState("error");
      setPublishError(
        {
          "no-google-access":
            "We don't have Google Drive access for your account yet — try signing out and back in.",
          "google-error":
            "Something went wrong creating your Google Sheet. Please try again.",
          "empty-title": "Give your form a title before publishing.",
          "publish-limit":
            "You've reached your published-forms limit — delete or archive one from Manage Forms before publishing another.",
          "storage-full": STORAGE_FULL_ADMIN_MESSAGE,
        }[result.error],
      );
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function addField(def: FieldTypeDef) {
    const field = def.create();
    setFields((prev) => [...prev, field]);
    setSelectedId(field.id);
  }

  function updateField(updated: FormField) {
    setFields((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  }

  function deleteField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  }

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const source = active.data.current?.source;
    if (source === "palette") {
      const type = active.data.current?.type as FieldType;
      setActiveDrag({ kind: "palette", def: getFieldTypeDef(type) });
    } else {
      const field = fields.find((f) => f.id === active.id);
      if (field) setActiveDrag({ kind: "field", field });
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    const source = active.data.current?.source;
    if (source !== "palette") {
      setInsertionTargetId(null);
      return;
    }
    setInsertionTargetId(over ? String(over.id) : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDrag(null);
    setInsertionTargetId(null);
    if (!over) return;

    const source = active.data.current?.source;
    const isEndTarget = over.id === "canvas" || over.id === "canvas-end";

    if (source === "palette") {
      const type = active.data.current?.type as FieldType;
      const newField = createField(type);
      setFields((prev) => {
        if (isEndTarget) return [...prev, newField];
        const overIndex = prev.findIndex((f) => f.id === over.id);
        if (overIndex === -1) return [...prev, newField];
        const next = [...prev];
        next.splice(overIndex, 0, newField);
        return next;
      });
      setSelectedId(newField.id);
      return;
    }

    if (active.id === over.id) return;
    setFields((prev) => {
      const oldIndex = prev.findIndex((f) => f.id === active.id);
      const newIndex = isEndTarget
        ? prev.length - 1
        : prev.findIndex((f) => f.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function handleDragCancel() {
    setActiveDrag(null);
    setInsertionTargetId(null);
  }

  if (flowStep === "design") {
    return (
      <div className="flex flex-1 flex-col bg-background">
        <header className="sticky top-0 z-20 border-b border-royal-100 bg-white/80 backdrop-blur">
          <div className="flex w-full items-center gap-4 px-6 py-3">
            <Link
              href="/"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-royal-500 hover:bg-royal-50"
              aria-label="Back to home"
            >
              <ArrowLeft size={18} />
            </Link>
            <span className="text-lg font-semibold text-royal-950">
              Design your form
            </span>
            <div className="flex-1" />
            <UserMenu />
          </div>
        </header>
        <DesignStep
          formTitle={formTitle}
          onTitleChange={setFormTitle}
          theme={theme}
          onThemeChange={setTheme}
          closing={closing}
          onClosingChange={setClosing}
          onContinue={() => setFlowStep("build")}
          formId={formId}
          requireAccessCode={requireAccessCode}
          accessCodes={accessCodes}
          loginLimitFeatureEnabled={loginLimitFeatureEnabled}
          onNeedSignIn={handleNeedSignIn}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-royal-100 bg-white/80 backdrop-blur">
        <div className="flex w-full items-center gap-4 px-6 py-3">
          <Link
            href="/"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-royal-500 hover:bg-royal-50"
            aria-label="Back to home"
          >
            <ArrowLeft size={18} />
          </Link>
          <input
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            className="flex-1 rounded-md bg-transparent px-2 py-1 text-lg font-semibold text-royal-950 focus:bg-royal-50 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setFlowStep("design")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-royal-500 hover:bg-royal-50"
            aria-label="Edit design"
            title="Edit design"
          >
            <Palette size={16} />
          </button>
          <div className="flex rounded-full border border-royal-200 bg-white p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                mode === "edit"
                  ? "bg-royal-600 text-white"
                  : "text-royal-600 hover:bg-royal-50"
              }`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setMode("preview")}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                mode === "preview"
                  ? "bg-royal-600 text-white"
                  : "text-royal-600 hover:bg-royal-50"
              }`}
            >
              Preview
            </button>
          </div>
          {formId && formStatus && (
            <span className="text-xs font-medium text-royal-400">
              {savingState === "saving" ? "Saving…" : "Saved"}
            </span>
          )}
          {formStatus === "maintenance" && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
              Under maintenance
            </span>
          )}
          {formStatus === "published" || formStatus === "maintenance" ? (
            <button
              type="button"
              onClick={handleToggleMaintenance}
              disabled={maintenancePending}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                formStatus === "maintenance"
                  ? "bg-royal-600 text-white hover:bg-royal-700"
                  : "border border-amber-300 text-amber-700 hover:bg-amber-50"
              }`}
            >
              {maintenancePending
                ? "Please wait…"
                : formStatus === "maintenance"
                  ? "Publish"
                  : "Maintenance"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishState === "publishing"}
              className="rounded-full bg-royal-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-royal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {publishState === "publishing" ? "Publishing…" : "Publish"}
            </button>
          )}
          <UserMenu />
        </div>
      </header>

      {publishState === "done" && publishedSlug && (
        <PublishSuccessBanner
          slug={publishedSlug}
          onDismiss={() => setPublishState("idle")}
        />
      )}
      {publishState === "error" && publishError && (
        <div className="flex w-full items-center justify-between gap-3 px-6 pt-4">
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {publishError}
          </p>
        </div>
      )}

      {mode === "preview" ? (
        <main>
          <PageBackground background={theme.pageBackground} className="px-6 py-10" parallax>
            <div className="mx-auto max-w-3xl">
              <p className="mb-4 text-center text-xs font-medium text-royal-400">
                This is what people filling out the form will see.
              </p>
              <FormRenderer title={formTitle} fields={fields} theme={theme} />
            </div>
          </PageBackground>
        </main>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <main
            className={`relative grid w-full gap-6 px-6 py-8 ${
              paletteOpen
                ? "md:grid-cols-[var(--palette-width)_minmax(0,1fr)]"
                : "md:grid-cols-[minmax(0,1fr)]"
            }`}
            style={paletteOpen ? ({ "--palette-width": `${paletteWidth}px` } as React.CSSProperties) : undefined}
            onClick={() => setSelectedId(null)}
          >
            {paletteOpen && <FieldPalette onAdd={addField} />}

            {paletteOpen && (
              <div
                style={{ left: `calc(1.5rem + ${paletteWidth}px + 0.75rem)` }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={handlePaletteResizePointerDown}
                onPointerMove={handlePaletteResizePointerMove}
                onPointerUp={handlePaletteResizePointerUp}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setPaletteWidth(PALETTE_DEFAULT_WIDTH);
                }}
                title="Drag to resize — double-click to reset"
                className="absolute top-8 bottom-8 z-20 hidden w-3 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center md:flex"
              >
                <div className="h-16 w-1 rounded-full bg-royal-200 transition-colors hover:bg-royal-400" />
              </div>
            )}

            <div className="min-w-0 w-full" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPaletteOpen((v) => !v);
                }}
                className="mb-3 hidden items-center gap-1.5 rounded-md border border-royal-200 bg-white px-2.5 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-50 md:flex"
              >
                {paletteOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
                {paletteOpen ? "Hide panel" : "Show panel"}
              </button>
              <FormCanvas
                fields={fields}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onChange={updateField}
                onDelete={deleteField}
                insertionTargetId={insertionTargetId}
                accessUsernames={accessUsernames}
              />
            </div>
          </main>

          <DragOverlay>
            {activeDrag?.kind === "palette" && (
              <div className="flex items-center gap-2 rounded-lg border border-royal-300 bg-white px-3 py-2 text-sm font-medium text-royal-700 shadow-lg">
                <activeDrag.def.icon size={16} />
                {activeDrag.def.label}
              </div>
            )}
            {activeDrag?.kind === "field" && (
              <div className="rounded-xl border border-royal-300 bg-white px-4 py-3 text-sm font-medium text-royal-950 shadow-lg">
                {activeDrag.field.label || "Untitled question"}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {showStorageChoice && (
        <StorageChoiceModal
          onClose={() => setShowStorageChoice(false)}
          onChoose={publishWithStorage}
          collectsFiles={formCollectsFiles(fields)}
        />
      )}
    </div>
  );
}

// Field types whose answers are files saved on the server when the form
// uses local storage — worth a heads-up in the storage choice.
function formCollectsFiles(fields: FormField[]): boolean {
  return fields.some(
    (field) =>
      ["photo", "document", "signature", "drawing", "design-board"].includes(field.type) ||
      (field.type === "player-list" && field.columns.some((c) => c.type === "photo")) ||
      (field.type === "button" && field.fields.some((c) => c.type === "photo")),
  );
}

function StorageChoiceModal({
  onClose,
  onChoose,
  collectsFiles,
}: {
  onClose: () => void;
  onChoose: (storage: StorageChoice) => void;
  collectsFiles: boolean;
}) {
  const [myStorage, setMyStorage] = useState<MyStorage | null>(null);
  useEffect(() => {
    let cancelled = false;
    getMyStorage()
      .then((result) => {
        if (!cancelled) setMyStorage(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-royal-100 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-royal-950">
            Where should responses be stored?
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-royal-300 hover:bg-royal-50 hover:text-royal-600"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => onChoose("google")}
            className="flex items-center gap-3 rounded-xl border border-royal-200 p-4 text-left transition-colors hover:border-royal-400 hover:bg-royal-50"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-royal-100 text-royal-600">
              <Cloud size={20} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-royal-950">
                Google Drive
              </span>
              <span className="block text-xs text-royal-500">
                Creates a Sheet + Drive folder in your own Google account.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => onChoose("local")}
            className="flex items-center gap-3 rounded-xl border border-royal-200 p-4 text-left transition-colors hover:border-royal-400 hover:bg-royal-50"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-royal-100 text-royal-600">
              <HardDrive size={20} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-royal-950">
                Store locally
              </span>
              <span className="block text-xs text-royal-500">
                Keeps responses and files on this server — nothing goes
                through Google. View them from Manage Forms.
              </span>
              {myStorage && (
                <span className="mt-1 block text-xs font-medium text-royal-600">
                  {myStorage.quotaBytes === null
                    ? `Uses your storage — ${formatBytes(myStorage.usedBytes)} used (unlimited).`
                    : `Uses your storage — ${formatBytes(myStorage.freeBytes ?? 0)} free of ${formatBytes(myStorage.quotaBytes)}.`}
                </span>
              )}
              {collectsFiles && (
                <span className="mt-1 block text-xs text-amber-700">
                  💡 This form collects files (photos, documents, signatures…), which count toward
                  your storage. For big events, Google Drive storage is a better fit.
                </span>
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function PublishSuccessBanner({
  slug,
  onDismiss,
}: {
  slug: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/${slug}`
      : `/${slug}`;

  function handleCopy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3 px-6 pt-4">
      <div className="flex flex-1 items-center gap-3 rounded-lg border border-royal-200 bg-royal-50 px-4 py-2.5">
        <Check size={16} className="shrink-0 text-royal-600" />
        <span className="text-sm text-royal-700">Published — live at</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 truncate text-sm font-medium text-royal-950 underline"
        >
          {url}
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="flex shrink-0 items-center gap-1 rounded-md border border-royal-200 bg-white px-2.5 py-1 text-xs font-medium text-royal-600 hover:bg-royal-50"
        >
          <Copy size={12} />
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs font-medium text-royal-400 hover:text-royal-600"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
