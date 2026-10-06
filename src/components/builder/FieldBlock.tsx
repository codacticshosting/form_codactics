"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Image,
  Plus,
  Trash2,
  X,
  FileText,
  PenTool,
  Paintbrush,
  Layers,
  Code2,
  Star,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  getFieldTypeDef,
  PLAYER_LIST_COLUMN_DEFS,
  PHOTO_COLUMN_DEF,
  CODE_LANGUAGES,
  codeLanguageLabel,
  type PlayerListColumnTypeDef,
} from "@/lib/field-types";
import {
  normalizeDropdownOption,
  type ChecklistItem,
  type ComputedOperation,
  type ComputedTerm,
  type FormField,
  type PlayerListColumn,
} from "@/types/form-builder";
import { wouldCreateCycle } from "@/lib/computed";
import { Switch } from "./Switch";
import { OptionListEditor } from "./OptionListEditor";
import { DropdownOptionEditor } from "./DropdownOptionEditor";
import { RankingItemEditor } from "./RankingItemEditor";
import { SingleImageUploader } from "./SingleImageUploader";
import { MarkdownContent } from "@/components/shared/MarkdownContent";

export function FieldBlock({
  field,
  allFields,
  selected,
  onSelect,
  onChange,
  onDelete,
  accessUsernames,
}: {
  field: FormField;
  allFields: FormField[];
  selected: boolean;
  onSelect: () => void;
  onChange: (field: FormField) => void;
  onDelete: () => void;
  accessUsernames: string[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id, data: { source: "canvas" } });

  const def = getFieldTypeDef(field.type);
  const Icon = def.icon;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`w-full rounded-xl border p-4 shadow-sm transition-colors ${
        field.hidden ? "bg-royal-50/40" : "bg-white"
      } ${
        field.hidden
          ? `border-red-400 ${selected ? "ring-2 ring-red-400/20" : "hover:border-red-500"}`
          : selected
            ? "border-royal-500 ring-2 ring-royal-500/20"
            : "border-royal-100 hover:border-royal-300"
      } ${isDragging ? "z-10 opacity-60" : ""}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab touch-none rounded p-1 text-royal-300 hover:bg-royal-50 hover:text-royal-500 active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical size={16} />
        </button>
        <span className="flex items-center gap-1.5 rounded-full bg-royal-100 px-2.5 py-1 text-xs font-medium text-royal-600">
          <Icon size={12} />
          {def.label}
        </span>
        <div className="flex-1" />
        {selected && (
          <>
            {field.type !== "static-text" &&
              field.type !== "section-break" &&
              field.type !== "computed" &&
              field.type !== "image-display" &&
              field.type !== "checklist" && (
              <Switch
                checked={field.required}
                onChange={(required) => onChange({ ...field, required })}
                label="Required"
              />
            )}
            {field.type !== "static-text" && field.type !== "computed" && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange({ ...field, hidden: !field.hidden });
                }}
                className={`rounded-md p-1.5 hover:bg-royal-50 ${
                  field.hidden ? "text-red-600" : "text-royal-400 hover:text-royal-600"
                }`}
                aria-label={field.hidden ? "Show to respondents" : "Hide from respondents"}
                title={
                  field.type === "section-break"
                    ? field.hidden
                      ? "Section hidden — this section and everything in it is skipped. Click to show again"
                      : "Hide this entire section (and everything in it) from respondents"
                    : field.hidden
                      ? "Hidden from respondents — click to show again"
                      : "Keep this question but hide it from respondents"
                }
              >
                {field.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="rounded-md p-1.5 text-royal-400 hover:bg-red-50 hover:text-red-600"
              aria-label="Delete field"
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>

      {field.type !== "static-text" && field.type !== "image-display" && (
        <input
          value={field.label}
          onChange={(e) => onChange({ ...field, label: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          placeholder={
            field.type === "section-break" ? "Section title" : "Question label"
          }
          className="w-full border-b border-transparent bg-transparent pb-1 text-base font-medium text-royal-950 focus:border-royal-400 focus:outline-none"
        />
      )}
      {!selected && (field.required || field.hidden) && (
        <span className="mt-1 flex items-center gap-2">
          {field.hidden && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
              <EyeOff size={11} />
              {field.type === "section-break"
                ? "Section hidden — nothing in it will show"
                : "Hidden from respondents"}
            </span>
          )}
          {field.required && (
            <span className="text-xs font-medium text-royal-400">Required</span>
          )}
        </span>
      )}

      <div className="mt-3">
        <FieldPreview
          field={field}
          allFields={allFields}
          onChange={onChange}
          editable={selected}
          accessUsernames={accessUsernames}
        />
      </div>

      {selected &&
        field.type !== "computed" &&
        field.type !== "player-list" &&
        field.type !== "static-text" &&
        field.type !== "image-display" && (
          <PopupSettings field={field} onChange={onChange} />
        )}
    </div>
  );
}

function PopupSettings({
  field,
  onChange,
}: {
  field: FormField;
  onChange: (field: FormField) => void;
}) {
  const popup = field.popup ?? { enabled: false, title: "", content: "" };
  const isSectionBreak = field.type === "section-break";

  return (
    <div
      className="mt-3 border-t border-royal-100 pt-3"
      onClick={(e) => e.stopPropagation()}
    >
      <Switch
        checked={popup.enabled}
        onChange={(enabled) => onChange({ ...field, popup: { ...popup, enabled } })}
        label={
          isSectionBreak
            ? "Show a popup when entering this section"
            : "Show a popup when this field is focused"
        }
      />
      {popup.enabled && (
        <div className="mt-2 flex flex-col gap-2">
          <Switch
            checked={popup.repeat ?? false}
            onChange={(repeat) => onChange({ ...field, popup: { ...popup, repeat } })}
            label={
              popup.repeat
                ? "Shows every time"
                : "Shows once per form-fill"
            }
          />
          <input
            value={popup.title}
            onChange={(e) =>
              onChange({ ...field, popup: { ...popup, title: e.target.value } })
            }
            placeholder="Popup title (optional)"
            className="w-full rounded-md border border-royal-200 px-3 py-2 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          />
          <textarea
            value={popup.content}
            onChange={(e) =>
              onChange({ ...field, popup: { ...popup, content: e.target.value } })
            }
            rows={3}
            placeholder="Popup message — markdown supported, e.g. **bold**, *italic*, links"
            className="w-full rounded-md border border-royal-200 px-3 py-2 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          />
          {popup.content && (
            <div className="rounded-lg border border-royal-100 bg-royal-50/40 p-3">
              <span className="mb-2 block text-[11px] font-medium text-royal-400">
                Preview
              </span>
              {popup.title && (
                <p className="mb-1 text-sm font-semibold text-royal-950">
                  {popup.title}
                </p>
              )}
              <MarkdownContent content={popup.content} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectionVisibilitySettings({
  field,
  onChange,
  accessUsernames,
}: {
  field: Extract<FormField, { type: "section-break" }>;
  onChange: (field: FormField) => void;
  accessUsernames: string[];
}) {
  const restricted = !!field.visibleToUsernames && field.visibleToUsernames.length > 0;

  function toggleUsername(username: string, checked: boolean) {
    const current = field.visibleToUsernames ?? [];
    const next = checked
      ? [...current, username]
      : current.filter((u) => u !== username);
    onChange({ ...field, visibleToUsernames: next });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-royal-100 pt-3">
      <span className="text-xs font-medium text-royal-700">
        Who sees this section
      </span>
      <div className="flex rounded-full border border-royal-200 bg-white p-0.5 text-xs font-medium w-fit">
        <button
          type="button"
          onClick={() => onChange({ ...field, visibleToUsernames: undefined })}
          className={`rounded-full px-3 py-1 transition-colors ${
            !restricted ? "bg-royal-600 text-white" : "text-royal-600"
          }`}
        >
          Everyone
        </button>
        <button
          type="button"
          onClick={() =>
            onChange({
              ...field,
              visibleToUsernames: field.visibleToUsernames?.length
                ? field.visibleToUsernames
                : [],
            })
          }
          className={`rounded-full px-3 py-1 transition-colors ${
            restricted ? "bg-royal-600 text-white" : "text-royal-600"
          }`}
        >
          Specific users
        </button>
      </div>
      {field.visibleToUsernames !== undefined && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-royal-50/60 p-2.5">
          {accessUsernames.length === 0 ? (
            <p className="text-xs text-royal-400">
              No access-code usernames set up yet — add some in Users first.
            </p>
          ) : (
            accessUsernames.map((username) => (
              <label
                key={username}
                className="flex items-center gap-2 text-sm text-royal-800"
              >
                <input
                  type="checkbox"
                  checked={field.visibleToUsernames?.includes(username) ?? false}
                  onChange={(e) => toggleUsername(username, e.target.checked)}
                  className="h-4 w-4 rounded border-royal-300"
                />
                {username}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function FieldPreview({
  field,
  allFields,
  onChange,
  editable,
  accessUsernames,
}: {
  field: FormField;
  allFields: FormField[];
  onChange: (field: FormField) => void;
  editable: boolean;
  accessUsernames: string[];
}) {
  switch (field.type) {
    case "short-text":
      return (
        <input
          disabled
          placeholder="Short answer text"
          className="w-full max-w-sm rounded-md border border-royal-100 bg-royal-50/40 px-3 py-2 text-sm text-royal-400"
        />
      );
    case "long-text":
      return (
        <textarea
          disabled
          placeholder="Long answer text"
          rows={2}
          className="w-full max-w-md rounded-md border border-royal-100 bg-royal-50/40 px-3 py-2 text-sm text-royal-400"
        />
      );
    case "number":
      return editable ? (
        <div
          className="flex items-center gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          <label className="flex items-center gap-2 text-xs font-medium text-royal-700">
            Min value
            <input
              type="number"
              value={field.min ?? ""}
              placeholder="—"
              onChange={(e) =>
                onChange({
                  ...field,
                  min:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
              className="w-20 rounded-md border border-royal-200 bg-white px-2 py-1 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-royal-700">
            Max value
            <input
              type="number"
              value={field.max ?? ""}
              placeholder="—"
              onChange={(e) =>
                onChange({
                  ...field,
                  max:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
              className="w-20 rounded-md border border-royal-200 bg-white px-2 py-1 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
            />
          </label>
        </div>
      ) : (
        <input
          disabled
          type="number"
          placeholder={
            field.min != null || field.max != null
              ? `${field.min ?? "any"} – ${field.max ?? "any"}`
              : "0"
          }
          className="w-full max-w-[140px] rounded-md border border-royal-100 bg-royal-50/40 px-3 py-2 text-sm text-royal-400"
        />
      );
    case "email":
      return (
        <input
          disabled
          type="email"
          placeholder="name@example.com"
          className="w-full max-w-sm rounded-md border border-royal-100 bg-royal-50/40 px-3 py-2 text-sm text-royal-400"
        />
      );
    case "phone":
      return (
        <input
          disabled
          type="tel"
          placeholder="+1 555 000 1234"
          className="w-full max-w-sm rounded-md border border-royal-100 bg-royal-50/40 px-3 py-2 text-sm text-royal-400"
        />
      );
    case "link":
      return (
        <input
          disabled
          type="url"
          placeholder="https://instagram.com/yourhandle"
          className="w-full max-w-sm rounded-md border border-royal-100 bg-royal-50/40 px-3 py-2 text-sm text-royal-400"
        />
      );
    case "date":
      return (
        <input
          disabled
          type="date"
          className="w-full max-w-[180px] rounded-md border border-royal-100 bg-royal-50/40 px-3 py-2 text-sm text-royal-400"
        />
      );
    case "photo":
      return (
        <div className="flex w-full max-w-xs items-center gap-2 rounded-md border border-dashed border-royal-200 bg-royal-50/40 px-3 py-4 text-royal-400">
          <Image size={16} />
          <span className="text-sm">Click or drop image to upload</span>
        </div>
      );
    case "document":
      return (
        <div className="flex w-full max-w-xs items-center gap-2 rounded-md border border-dashed border-royal-200 bg-royal-50/40 px-3 py-4 text-royal-400">
          <FileText size={16} />
          <span className="text-sm">Click or drop file to upload</span>
        </div>
      );
    case "code":
      return editable ? (
        <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
          <p className="text-xs text-royal-500">
            Pick one to lock the field to that language, or several to let
            respondents choose which one they&apos;re submitting in.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CODE_LANGUAGES.map((lang) => {
              const active = field.languages.includes(lang.id);
              return (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...field,
                      languages: active
                        ? field.languages.filter((l) => l !== lang.id)
                        : [...field.languages, lang.id],
                    })
                  }
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-royal-600 bg-royal-600 text-white"
                      : "border-royal-200 bg-white text-royal-600 hover:bg-royal-50"
                  }`}
                >
                  {lang.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-royal-400">
            {field.languages.length === 0
              ? "Any language"
              : field.languages.length === 1
                ? codeLanguageLabel(field.languages[0])
                : `${field.languages.map(codeLanguageLabel).join(", ")} — respondent picks one`}
          </p>
          <div className="flex w-full items-center gap-2 rounded-md border border-dashed border-royal-200 bg-royal-50/40 px-3 py-4 text-royal-400">
            <Code2 size={16} />
            <span className="font-mono text-sm">Code box</span>
          </div>
        </div>
      );
    case "signature":
      return (
        <div className="flex h-24 w-full max-w-sm items-center justify-center gap-2 rounded-md border border-dashed border-royal-200 bg-royal-50/40 text-royal-400">
          <PenTool size={16} />
          <span className="text-sm">Signature pad</span>
        </div>
      );
    case "drawing":
      return (
        <div className="flex h-24 w-full max-w-sm items-center justify-center gap-2 rounded-md border border-dashed border-royal-200 bg-royal-50/40 text-royal-400">
          <Paintbrush size={16} />
          <span className="text-sm">Drawing board</span>
        </div>
      );
    case "design-board":
      return editable ? (
        <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
          <SingleImageUploader
            imageDataUrl={field.baseImageDataUrl}
            onChange={(baseImageDataUrl) => onChange({ ...field, baseImageDataUrl })}
            label="Template image"
          />
          <p className="text-xs text-royal-400">
            Respondents can upload up to 5 photos onto this template, drag
            them into place, and draw on top.
          </p>
        </div>
      ) : field.baseImageDataUrl ? (
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={field.baseImageDataUrl}
            alt=""
            className="max-h-48 w-full rounded-md border border-royal-100 object-contain"
          />
          <p className="text-xs text-royal-400">
            Respondents design on top of this template
          </p>
        </div>
      ) : (
        <div className="flex w-full items-center gap-2 rounded-md border border-dashed border-royal-200 bg-royal-50/40 px-3 py-4 text-royal-400">
          <Layers size={16} />
          <span className="text-sm">No template image uploaded yet</span>
        </div>
      );
    case "checkbox":
      return editable ? (
        <div
          className="flex items-center gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          <label className="flex items-center gap-2">
            <input disabled type="radio" className="h-4 w-4" />
            <input
              value={field.yesLabel}
              onChange={(e) =>
                onChange({ ...field, yesLabel: e.target.value })
              }
              placeholder="Yes"
              className="w-24 rounded-md border border-royal-200 bg-white px-2 py-1 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2">
            <input disabled type="radio" className="h-4 w-4" />
            <input
              value={field.noLabel}
              onChange={(e) =>
                onChange({ ...field, noLabel: e.target.value })
              }
              placeholder="No"
              className="w-24 rounded-md border border-royal-200 bg-white px-2 py-1 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
            />
          </label>
        </div>
      ) : (
        <div className="flex items-center gap-5 text-sm text-royal-400">
          <label className="flex items-center gap-2">
            <input
              disabled
              type="radio"
              name={`preview-${field.id}`}
              className="h-4 w-4"
            />
            {field.yesLabel}
          </label>
          <label className="flex items-center gap-2">
            <input
              disabled
              type="radio"
              name={`preview-${field.id}`}
              className="h-4 w-4"
            />
            {field.noLabel}
          </label>
        </div>
      );
    case "dropdown":
      return editable ? (
        <div
          className="flex flex-col gap-3"
          onClick={(e) => e.stopPropagation()}
        >
          <Switch
            checked={field.allowMultiple}
            onChange={(allowMultiple) => onChange({ ...field, allowMultiple })}
            label="Allow multiple selections"
          />
          {field.allowMultiple && (
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-medium text-royal-700">
                Require at least
                <input
                  type="number"
                  min={0}
                  max={field.maxSelections || field.options.length || undefined}
                  value={field.minSelections ?? ""}
                  onChange={(e) => {
                    const minSelections = e.target.value
                      ? Math.max(0, Number(e.target.value))
                      : undefined;
                    onChange({
                      ...field,
                      minSelections,
                      // Never leave max silently below the new min.
                      maxSelections:
                        minSelections !== undefined &&
                        field.maxSelections !== undefined &&
                        field.maxSelections < minSelections
                          ? minSelections
                          : field.maxSelections,
                    });
                  }}
                  placeholder="0"
                  className="w-20 rounded-md border border-royal-200 bg-white px-2 py-1 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
                />
                selections
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-royal-700">
                Limit to at most
                <input
                  type="number"
                  min={field.minSelections || 1}
                  max={field.options.length || undefined}
                  value={field.maxSelections ?? ""}
                  onChange={(e) => {
                    const maxSelections = e.target.value
                      ? Math.max(1, Number(e.target.value))
                      : undefined;
                    onChange({
                      ...field,
                      maxSelections,
                      // Never leave min silently above the new max.
                      minSelections:
                        maxSelections !== undefined &&
                        field.minSelections !== undefined &&
                        field.minSelections > maxSelections
                          ? maxSelections
                          : field.minSelections,
                    });
                  }}
                  placeholder="No limit"
                  className="w-24 rounded-md border border-royal-200 bg-white px-2 py-1 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
                />
                selections
              </label>
            </div>
          )}
          <Switch
            checked={field.allowOther}
            onChange={(allowOther) => onChange({ ...field, allowOther })}
            label="Allow 'Other' (free text)"
          />
          <DropdownOptionEditor
            options={field.options.map(normalizeDropdownOption)}
            onChange={(options) => onChange({ ...field, options })}
          />
        </div>
      ) : field.allowMultiple ? (
        <div className="flex flex-col gap-1.5">
          {field.options.map(normalizeDropdownOption).map((option, i) => (
            <label
              key={i}
              className="flex items-center gap-2 text-sm text-royal-400"
            >
              <input disabled type="checkbox" className="h-4 w-4 rounded" />
              {option.imageDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={option.imageDataUrl}
                  alt=""
                  className="h-6 w-6 shrink-0 rounded object-cover"
                />
              )}
              {option.label}
            </label>
          ))}
          {field.allowOther && (
            <label className="flex items-center gap-2 text-sm text-royal-400">
              <input disabled type="checkbox" className="h-4 w-4 rounded" />
              Other
            </label>
          )}
        </div>
      ) : (
        <select
          disabled
          className="w-full max-w-sm rounded-md border border-royal-100 bg-royal-50/40 px-3 py-2 text-sm text-royal-400"
        >
          <option>
            {field.options[0] ? normalizeDropdownOption(field.options[0]).label : "Choose..."}
          </option>
          {field.allowOther && <option>Other</option>}
        </select>
      );
    case "multiple-choice":
      return editable ? (
        <OptionListEditor
          options={field.options}
          onChange={(options) => onChange({ ...field, options })}
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          {field.options.map((option, i) => (
            <label
              key={i}
              className="flex items-center gap-2 text-sm text-royal-400"
            >
              <input
                disabled
                type="radio"
                name={`preview-${field.id}`}
                className="h-4 w-4"
              />
              {option}
            </label>
          ))}
        </div>
      );
    case "section-break":
      return editable ? (
        <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
          <textarea
            value={field.description}
            onChange={(e) =>
              onChange({ ...field, description: e.target.value })
            }
            rows={2}
            placeholder="Optional description shown under the section title. Markdown supported — **bold**, *italic*."
            className="w-full rounded-md border border-royal-200 px-3 py-2 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          />
          <label className="flex items-center gap-2 text-xs font-medium text-royal-700">
            Text color
            <input
              type="color"
              value={field.color ?? "#141a42"}
              onChange={(e) => onChange({ ...field, color: e.target.value })}
              className="h-7 w-7 shrink-0 cursor-pointer rounded border border-royal-200 p-0.5"
            />
            {field.color && (
              <button
                type="button"
                onClick={() => onChange({ ...field, color: undefined })}
                className="text-royal-400 hover:underline"
              >
                Reset
              </button>
            )}
          </label>
          {field.description && (
            <div className="rounded-lg border border-royal-100 bg-royal-50/40 p-3">
              <span className="mb-2 block text-[11px] font-medium text-royal-400">
                Preview
              </span>
              <MarkdownContent content={field.description} color={field.color} />
            </div>
          )}
          {accessUsernames.length > 0 && (
            <SectionVisibilitySettings
              field={field}
              onChange={onChange}
              accessUsernames={accessUsernames}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-royal-200" />
            <span className="text-xs font-medium text-royal-400">
              New page starts here
            </span>
            <div className="h-px flex-1 bg-royal-200" />
          </div>
          {field.visibleToUsernames && field.visibleToUsernames.length > 0 && (
            <p className="text-center text-[11px] font-medium text-royal-400">
              Only shown to: {field.visibleToUsernames.join(", ")}
            </p>
          )}
        </div>
      );
    case "rating":
      return editable ? (
        <div className="flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-medium text-royal-700">
              Min
              <input
                type="number"
                value={field.min}
                onChange={(e) =>
                  onChange({ ...field, min: Number(e.target.value) })
                }
                className="w-16 rounded-md border border-royal-200 bg-white px-2 py-1 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-royal-700">
              Max
              <input
                type="number"
                value={field.max}
                onChange={(e) =>
                  onChange({ ...field, max: Number(e.target.value) })
                }
                className="w-16 rounded-md border border-royal-200 bg-white px-2 py-1 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
              />
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-royal-700">
                Display as
              </span>
              <div className="flex rounded-full border border-royal-200 bg-white p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => onChange({ ...field, style: "stars" })}
                  className={`rounded-full px-3 py-1 transition-colors ${
                    field.style === "stars"
                      ? "bg-royal-600 text-white"
                      : "text-royal-600"
                  }`}
                >
                  Stars
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...field, style: "slider" })}
                  className={`rounded-full px-3 py-1 transition-colors ${
                    field.style === "slider"
                      ? "bg-royal-600 text-white"
                      : "text-royal-600"
                  }`}
                >
                  Slider
                </button>
              </div>
            </div>
          </div>
          {field.style === "stars" && field.max > 10 && (
            <p className="text-xs text-amber-600">
              More than 10 stars gets cramped to click precisely — consider
              switching to Slider for a range this wide.
            </p>
          )}
          <RatingPreview field={field} />
        </div>
      ) : (
        <RatingPreview field={field} />
      );
    case "computed":
      return editable ? (
        <ComputedSettings field={field} allFields={allFields} onChange={onChange} />
      ) : (
        <ComputedSummary field={field} allFields={allFields} />
      );
    case "player-list":
      return editable ? (
        <PlayerListSettings field={field} onChange={onChange} />
      ) : (
        <p className="text-sm text-royal-500">
          {field.playerCount} entries
          {field.columns.length > 0 &&
            ` — ${field.columns.map((column) => column.label).join(" · ")}`}
        </p>
      );
    case "button":
      return editable ? (
        <ButtonFieldSettings field={field} onChange={onChange} />
      ) : (
        <div className="flex flex-col gap-2">
          {field.buttonStyle === "image" && field.buttonImageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={field.buttonImageDataUrl}
              alt={field.buttonText || ""}
              className="h-16 w-16 rounded-lg border border-royal-100 object-cover"
            />
          ) : (
            <span className="inline-flex w-fit items-center rounded-full bg-royal-600/90 px-4 py-2 text-sm font-medium text-white">
              {field.buttonText || "Click to answer"}
            </span>
          )}
          <p className="text-xs text-royal-400">
            {field.fields.length === 0
              ? "No fields configured yet"
              : field.fields.map((f) => f.label).join(" · ")}
          </p>
        </div>
      );
    case "static-text":
      return editable ? (
        <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
          <textarea
            value={field.content}
            onChange={(e) => onChange({ ...field, content: e.target.value })}
            rows={5}
            placeholder={
              "Write your message here. Markdown supported — **bold**, *italic*, lists, [links](https://example.com), and tables:\n\n| Round | Date |\n|---|---|\n| 1 | Aug 10 |"
            }
            className="w-full rounded-md border border-royal-200 px-3 py-2 font-mono text-xs text-royal-950 focus:border-royal-500 focus:outline-none"
          />
          <label className="flex items-center gap-2 text-xs font-medium text-royal-700">
            Text color
            <input
              type="color"
              value={field.color ?? "#2635ab"}
              onChange={(e) => onChange({ ...field, color: e.target.value })}
              className="h-7 w-7 shrink-0 cursor-pointer rounded border border-royal-200 p-0.5"
            />
            {field.color && (
              <button
                type="button"
                onClick={() => onChange({ ...field, color: undefined })}
                className="text-royal-400 hover:underline"
              >
                Reset
              </button>
            )}
          </label>
          <SingleImageUploader
            imageDataUrl={field.imageDataUrl}
            onChange={(imageDataUrl) => onChange({ ...field, imageDataUrl })}
            label="Add an image (optional)"
          />
          {(field.content || field.imageDataUrl) && (
            <div className="flex flex-col gap-2 rounded-lg border border-royal-100 bg-royal-50/40 p-3">
              <span className="block text-[11px] font-medium text-royal-400">
                Preview
              </span>
              {field.imageDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={field.imageDataUrl}
                  alt=""
                  className="max-h-48 w-full rounded-md object-contain"
                />
              )}
              {field.content && (
                <MarkdownContent content={field.content} color={field.color} />
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg bg-royal-50/60 p-3">
          {field.imageDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={field.imageDataUrl}
              alt=""
              className="max-h-48 w-full rounded-md object-contain"
            />
          )}
          <MarkdownContent
            content={field.content || (field.imageDataUrl ? "" : "Write your message here.")}
          />
        </div>
      );
    case "image-display":
      return editable ? (
        <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
          <SingleImageUploader
            imageDataUrl={field.imageDataUrl}
            onChange={(imageDataUrl) => onChange({ ...field, imageDataUrl })}
            label="Upload image"
          />
          <input
            value={field.caption ?? ""}
            onChange={(e) => onChange({ ...field, caption: e.target.value })}
            placeholder="Caption shown under the image (optional)"
            className="w-full rounded-md border border-royal-200 px-3 py-2 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          />
        </div>
      ) : field.imageDataUrl ? (
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={field.imageDataUrl}
            alt={field.caption ?? ""}
            className="max-h-48 w-full rounded-md object-contain"
          />
          {field.caption && (
            <p className="text-xs text-royal-500">{field.caption}</p>
          )}
        </div>
      ) : (
        <div className="flex w-full items-center gap-2 rounded-md border border-dashed border-royal-200 bg-royal-50/40 px-3 py-4 text-royal-400">
          <Image size={16} />
          <span className="text-sm">No image uploaded yet</span>
        </div>
      );
    case "checklist":
      return editable ? (
        <ChecklistItemsEditor
          items={field.items}
          onChange={(items) => onChange({ ...field, items })}
        />
      ) : field.items.length === 0 ? (
        <p className="text-sm text-royal-400">No statements added yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {field.items.map((item) => (
            <label
              key={item.id}
              className="flex items-start gap-2 text-sm text-royal-400"
            >
              <input disabled type="checkbox" className="mt-0.5 h-4 w-4 rounded" />
              <span>
                {item.label}
                {item.required && <span className="ml-0.5 text-red-500">*</span>}
              </span>
            </label>
          ))}
        </div>
      );
    case "ranking":
      return editable ? (
        <div className="flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-royal-700">Layout</span>
            <div className="flex rounded-md border border-royal-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => onChange({ ...field, layout: "vertical" })}
                className={`rounded px-2.5 py-1 text-xs font-medium ${
                  field.layout === "vertical"
                    ? "bg-royal-600 text-white"
                    : "text-royal-600 hover:bg-royal-50"
                }`}
              >
                Top to bottom
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...field, layout: "horizontal" })}
                className={`rounded px-2.5 py-1 text-xs font-medium ${
                  field.layout === "horizontal"
                    ? "bg-royal-600 text-white"
                    : "text-royal-600 hover:bg-royal-50"
                }`}
              >
                Side by side
              </button>
            </div>
          </div>
          <RankingItemEditor
            items={field.items}
            onChange={(items) => onChange({ ...field, items })}
          />
        </div>
      ) : field.items.length === 0 ? (
        <p className="text-sm text-royal-400">No items added yet.</p>
      ) : (
        <div
          className={
            field.layout === "horizontal"
              ? "flex flex-wrap gap-2"
              : "flex flex-col gap-1.5"
          }
        >
          {field.items.map((item, i) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-md border border-royal-100 bg-royal-50/40 px-2.5 py-1.5 text-sm text-royal-400"
            >
              <span className="font-medium">{i + 1}.</span>
              {item.imageDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageDataUrl}
                  alt=""
                  className="h-6 w-6 shrink-0 rounded object-cover"
                />
              )}
              {item.label}
            </div>
          ))}
        </div>
      );
  }
}

function ChecklistItemsEditor({
  items,
  onChange,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}) {
  function updateItem(id: string, updates: Partial<ChecklistItem>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }

  function removeItem(id: string) {
    onChange(items.filter((item) => item.id !== id));
  }

  function addItem() {
    onChange([
      ...items,
      { id: crypto.randomUUID(), label: `Statement ${items.length + 1}`, required: false },
    ]);
  }

  return (
    <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2 rounded-lg border border-royal-100 bg-white p-2.5"
        >
          <input
            value={item.label}
            onChange={(e) => updateItem(item.id, { label: e.target.value })}
            className="min-w-0 flex-1 rounded-md border border-royal-200 px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          />
          <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-royal-600">
            <input
              type="checkbox"
              checked={item.required}
              onChange={(e) => updateItem(item.id, { required: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-royal-300"
            />
            Required
          </label>
          <button
            type="button"
            onClick={() => removeItem(item.id)}
            className="shrink-0 rounded-md p-1.5 text-royal-400 hover:bg-red-50 hover:text-red-600"
            aria-label="Remove statement"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-xs font-medium text-royal-600 hover:bg-royal-100"
      >
        <Plus size={14} />
        Add statement
      </button>
    </div>
  );
}

function RatingPreview({
  field,
}: {
  field: Extract<FormField, { type: "rating" }>;
}) {
  if (field.style === "stars") {
    const count = Math.max(1, Math.min(field.max, 10));
    return (
      <div className="flex items-center gap-1 text-royal-300">
        {Array.from({ length: count }).map((_, i) => (
          <Star key={i} size={20} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <input
        disabled
        type="range"
        min={field.min}
        max={field.max}
        className="w-full max-w-xs accent-royal-300"
      />
      <span className="text-xs text-royal-400">
        {field.min}–{field.max}
      </span>
    </div>
  );
}

const OPERATION_LABELS: Record<ComputedOperation, string> = {
  sum: "Sum",
  average: "Average",
  multiply: "Multiply",
  min: "Min",
  max: "Max",
};

function eligibleTermFields(
  field: Extract<FormField, { type: "computed" }>,
  allFields: FormField[],
): FormField[] {
  return allFields.filter((f) => {
    if (f.id === field.id) return false;
    if (f.type !== "number" && f.type !== "rating" && f.type !== "computed") {
      return false;
    }
    if (f.type === "computed" && wouldCreateCycle(allFields, field.id, f.id)) {
      return false;
    }
    return true;
  });
}

function termLabel(allFields: FormField[], term: ComputedTerm): string {
  if (term.type === "constant") return String(term.value);
  return (
    allFields.find((f) => f.id === term.fieldId)?.label || "Untitled question"
  );
}

function ComputedSummary({
  field,
  allFields,
}: {
  field: Extract<FormField, { type: "computed" }>;
  allFields: FormField[];
}) {
  if (field.terms.length === 0) {
    return <p className="text-sm text-royal-400">No fields selected yet.</p>;
  }
  return (
    <p className="text-sm text-royal-500">
      {OPERATION_LABELS[field.operation]} of{" "}
      {field.terms.map((t) => termLabel(allFields, t)).join(", ")}
      {!field.showOnForm && " · hidden from form"}
    </p>
  );
}

function ComputedSettings({
  field,
  allFields,
  onChange,
}: {
  field: Extract<FormField, { type: "computed" }>;
  allFields: FormField[];
  onChange: (field: FormField) => void;
}) {
  const eligible = eligibleTermFields(field, allFields);

  function replaceTerm(index: number, term: ComputedTerm) {
    onChange({
      ...field,
      terms: field.terms.map((t, i) => (i === index ? term : t)),
    });
  }

  function removeTerm(index: number) {
    onChange({ ...field, terms: field.terms.filter((_, i) => i !== index) });
  }

  function addTerm() {
    const next: ComputedTerm =
      eligible.length > 0
        ? { type: "field", fieldId: eligible[0].id }
        : { type: "constant", value: 0 };
    onChange({ ...field, terms: [...field.terms, next] });
  }

  return (
    <div className="flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
      <label className="flex items-center gap-2 text-xs font-medium text-royal-700">
        Operation
        <select
          value={field.operation}
          onChange={(e) =>
            onChange({
              ...field,
              operation: e.target.value as ComputedOperation,
            })
          }
          className="rounded-md border border-royal-200 bg-white px-2 py-1 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
        >
          <option value="sum">Sum</option>
          <option value="average">Average</option>
          <option value="multiply">Multiply</option>
          <option value="min">Min</option>
          <option value="max">Max</option>
        </select>
      </label>

      <div className="flex flex-col gap-2">
        {field.terms.map((term, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={term.type}
              onChange={(e) =>
                replaceTerm(
                  i,
                  e.target.value === "constant"
                    ? { type: "constant", value: 0 }
                    : { type: "field", fieldId: eligible[0]?.id ?? "" },
                )
              }
              className="shrink-0 rounded-md border border-royal-200 bg-white px-2 py-1 text-xs text-royal-950 focus:border-royal-500 focus:outline-none"
            >
              <option value="field">Field</option>
              <option value="constant">Number</option>
            </select>

            {term.type === "field" ? (
              <select
                value={term.fieldId}
                onChange={(e) =>
                  replaceTerm(i, { type: "field", fieldId: e.target.value })
                }
                className="min-w-0 flex-1 rounded-md border border-royal-200 bg-white px-2 py-1 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
              >
                {eligible.length === 0 && <option value="">No eligible fields yet</option>}
                {eligible.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label || "Untitled question"}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                value={term.value}
                onChange={(e) =>
                  replaceTerm(i, {
                    type: "constant",
                    value: Number(e.target.value),
                  })
                }
                className="min-w-0 flex-1 rounded-md border border-royal-200 bg-white px-2 py-1 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
              />
            )}

            <button
              type="button"
              onClick={() => removeTerm(i)}
              className="shrink-0 rounded p-1 text-royal-300 hover:bg-red-50 hover:text-red-600"
              aria-label="Remove term"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addTerm}
        className="flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-xs font-medium text-royal-600 hover:bg-royal-100"
      >
        <Plus size={14} />
        Add term
      </button>

      <div className="flex items-center border-t border-royal-100 pt-3">
        <Switch
          checked={field.showOnForm}
          onChange={(showOnForm) => onChange({ ...field, showOnForm })}
          label="Show on form (turn off to use only as a building block for other Computed fields)"
        />
      </div>

      <ComputedSummary field={field} allFields={allFields} />
    </div>
  );
}

function PlayerListSettings({
  field,
  onChange,
}: {
  field: Extract<FormField, { type: "player-list" }>;
  onChange: (field: FormField) => void;
}) {
  const hasPhoto = field.columns.some((column) => column.type === "photo");
  const sideBySide = field.layout === "row";

  function updateColumn(id: string, updates: Partial<PlayerListColumn>) {
    onChange({
      ...field,
      columns: field.columns.map((column) =>
        column.id === id
          ? ({ ...column, ...updates } as PlayerListColumn)
          : column,
      ),
    });
  }

  function removeColumn(id: string) {
    onChange({
      ...field,
      columns: field.columns.filter((column) => column.id !== id),
    });
  }

  function addColumn(def: PlayerListColumnTypeDef) {
    onChange({ ...field, columns: [...field.columns, def.create()] });
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-4 rounded-lg bg-royal-50/60 p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-medium text-royal-700">
          Number of entries
          <input
            type="number"
            min={1}
            value={field.playerCount}
            onChange={(e) =>
              onChange({
                ...field,
                playerCount: Math.max(1, Number(e.target.value)),
              })
            }
            className="w-16 rounded-md border border-royal-200 bg-white px-2 py-1 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          />
        </label>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-royal-700">Layout</span>
          <LayoutSlider
            sideBySide={sideBySide}
            onChange={(layout) => onChange({ ...field, layout })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-royal-100 pt-3">
        <span className="text-xs font-medium text-royal-700">Fields</span>
        {field.columns.length === 0 ? (
          <p className="text-xs text-royal-400">
            No fields yet — use “Add field” or “Add photo” below to build the
            entry row.
          </p>
        ) : (
          <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-4">
            {field.columns.map((column) => (
              <PlayerListColumnCard
                key={column.id}
                column={column}
                onChange={(updates) => updateColumn(column.id, updates)}
                onRemove={() => removeColumn(column.id)}
              />
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <AddFieldMenu onAdd={addColumn} />
          <button
            type="button"
            disabled={hasPhoto}
            onClick={() => addColumn(PHOTO_COLUMN_DEF)}
            className="flex items-center gap-1.5 rounded-md border border-dashed border-royal-300 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={14} />
            Add photo
          </button>
        </div>
      </div>

      {field.columns.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-royal-100 pt-3">
          <span className="text-xs font-medium text-royal-700">
            Preview — {field.playerCount} player
            {field.playerCount === 1 ? "" : "s"}
          </span>
          <PlayerListPreview
            columns={field.columns}
            playerCount={field.playerCount}
            layout={field.layout}
          />
        </div>
      )}
    </div>
  );
}

function ButtonFieldSettings({
  field,
  onChange,
}: {
  field: Extract<FormField, { type: "button" }>;
  onChange: (field: FormField) => void;
}) {
  function updateSubField(id: string, updates: Partial<PlayerListColumn>) {
    onChange({
      ...field,
      fields: field.fields.map((f) =>
        f.id === id ? ({ ...f, ...updates } as PlayerListColumn) : f,
      ),
    });
  }

  function removeSubField(id: string) {
    onChange({ ...field, fields: field.fields.filter((f) => f.id !== id) });
  }

  function addSubField(def: PlayerListColumnTypeDef) {
    onChange({ ...field, fields: [...field.fields, def.create()] });
  }

  const hasPhoto = field.fields.some((f) => f.type === "photo");

  return (
    <div
      className="flex min-w-0 flex-col gap-4 rounded-lg bg-royal-50/60 p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-royal-700">Button style</span>
        <div className="flex rounded-full border border-royal-200 bg-white p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => onChange({ ...field, buttonStyle: "text" })}
            className={`rounded-full px-3 py-1 transition-colors ${
              field.buttonStyle === "text" ? "bg-royal-600 text-white" : "text-royal-600"
            }`}
          >
            Text
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...field, buttonStyle: "image" })}
            className={`rounded-full px-3 py-1 transition-colors ${
              field.buttonStyle === "image" ? "bg-royal-600 text-white" : "text-royal-600"
            }`}
          >
            Image
          </button>
        </div>
      </div>

      {field.buttonStyle === "text" ? (
        <input
          value={field.buttonText}
          onChange={(e) => onChange({ ...field, buttonText: e.target.value })}
          placeholder="Button text, e.g. Add emergency contact"
          className="w-full rounded-md border border-royal-200 bg-white px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
        />
      ) : (
        <div className="flex flex-col gap-2">
          <SingleImageUploader
            imageDataUrl={field.buttonImageDataUrl}
            onChange={(imageDataUrl) => onChange({ ...field, buttonImageDataUrl: imageDataUrl })}
            label="Upload button image"
          />
          <input
            value={field.buttonText}
            onChange={(e) => onChange({ ...field, buttonText: e.target.value })}
            placeholder="Caption shown under the image (optional)"
            className="w-full rounded-md border border-royal-200 bg-white px-2.5 py-1.5 text-sm text-royal-950 focus:border-royal-500 focus:outline-none"
          />
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-royal-100 pt-3">
        <span className="text-xs font-medium text-royal-700">
          Fields shown in the popup
        </span>
        {field.fields.length === 0 ? (
          <p className="text-xs text-royal-400">
            No fields yet — use "Add field" or "Add photo" below.
          </p>
        ) : (
          <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-4">
            {field.fields.map((f) => (
              <PlayerListColumnCard
                key={f.id}
                column={f}
                onChange={(updates) => updateSubField(f.id, updates)}
                onRemove={() => removeSubField(f.id)}
              />
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <AddFieldMenu onAdd={addSubField} />
          <button
            type="button"
            disabled={hasPhoto}
            onClick={() => addSubField(PHOTO_COLUMN_DEF)}
            className="flex items-center gap-1.5 rounded-md border border-dashed border-royal-300 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={14} />
            Add photo
          </button>
        </div>
      </div>
    </div>
  );
}

function PlayerListPreview({
  columns,
  playerCount,
  layout,
}: {
  columns: PlayerListColumn[];
  playerCount: number;
  layout: "row" | "stacked";
}) {
  const count = Math.max(1, playerCount);

  if (layout === "row") {
    return (
      <div className="max-h-64 min-w-0 overflow-auto rounded-md border border-royal-100">
        <table className="w-full min-w-max border-collapse text-xs">
          <thead>
            <tr className="bg-royal-100/60">
              {columns.map((column) => (
                <th
                  key={column.id}
                  className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-royal-700"
                >
                  {column.label}
                  {column.required && (
                    <span className="text-red-500"> *</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: count }).map((_, i) => (
              <tr key={i} className="border-t border-royal-100">
                {columns.map((column) => (
                  <td key={column.id} className="px-2 py-1.5">
                    <PreviewCell column={column} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="flex max-h-64 min-w-0 flex-col gap-3 overflow-auto">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-md border border-royal-100 bg-white p-2.5"
        >
          <span className="mb-1.5 block text-[11px] font-semibold text-royal-500">
            Entry {i + 1}
          </span>
          <div className="flex flex-col gap-1.5">
            {columns.map((column) => (
              <div key={column.id} className="flex items-center gap-2">
                <span className="w-20 shrink-0 truncate text-[11px] text-royal-500">
                  {column.label}
                </span>
                <div className="min-w-0 flex-1">
                  <PreviewCell column={column} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PreviewCell({ column }: { column: PlayerListColumn }) {
  switch (column.type) {
    case "short-text":
      return (
        <input
          disabled
          placeholder="—"
          className="w-full min-w-[100px] rounded border border-royal-100 bg-royal-50/40 px-2 py-1 text-xs text-royal-400"
        />
      );
    case "number":
      return (
        <input
          disabled
          type="number"
          placeholder="0"
          className="w-20 rounded border border-royal-100 bg-royal-50/40 px-2 py-1 text-xs text-royal-400"
        />
      );
    case "dropdown":
      return (
        <select
          onClick={(e) => e.stopPropagation()}
          className="w-full min-w-[100px] rounded border border-royal-100 bg-royal-50/40 px-2 py-1 text-xs text-royal-500"
        >
          {(column.options ?? []).length > 0 ? (
            column.options!.map((option, i) => (
              <option key={i}>{option}</option>
            ))
          ) : (
            <option>Choose...</option>
          )}
        </select>
      );
    case "checkbox":
      return (
        <div className="flex items-center gap-2 text-xs text-royal-400">
          <span>Yes</span>
          <span>No</span>
        </div>
      );
    case "photo":
      return (
        <div className="flex items-center gap-1 text-royal-400">
          <Image size={12} />
          <span className="text-xs">Upload</span>
        </div>
      );
  }
}

function PlayerListColumnCard({
  column,
  onChange,
  onRemove,
}: {
  column: PlayerListColumn;
  onChange: (updates: Partial<PlayerListColumn>) => void;
  onRemove: () => void;
}) {
  const def =
    PLAYER_LIST_COLUMN_DEFS.find((d) => d.type === column.type) ??
    PHOTO_COLUMN_DEF;
  const Icon = def.icon;

  return (
    <div className="flex min-w-0 w-full flex-col gap-2 rounded-lg border border-royal-100 bg-white p-3">
      <div className="flex items-center gap-2">
        <Icon size={13} className="shrink-0 text-royal-400" />
        <input
          value={column.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="min-w-0 flex-1 border-b border-transparent bg-transparent text-sm font-medium text-royal-950 focus:border-royal-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-1 text-royal-300 hover:bg-red-50 hover:text-red-600"
          aria-label="Remove field"
        >
          <X size={14} />
        </button>
      </div>

      <Switch
        checked={column.required}
        onChange={(required) => onChange({ required })}
        label="Required"
      />

      {column.type === "dropdown" && (
        <OptionListEditor
          options={column.options ?? []}
          onChange={(options) => onChange({ options })}
        />
      )}
      {column.type === "short-text" && (
        <input
          disabled
          placeholder="Short answer"
          className="w-full rounded-md border border-royal-100 bg-royal-50/40 px-2 py-1.5 text-xs text-royal-400"
        />
      )}
      {column.type === "number" && (
        <input
          disabled
          type="number"
          placeholder="0"
          className="w-full rounded-md border border-royal-100 bg-royal-50/40 px-2 py-1.5 text-xs text-royal-400"
        />
      )}
      {column.type === "checkbox" && (
        <div className="flex items-center gap-3 text-xs text-royal-400">
          <span>Yes</span>
          <span>No</span>
        </div>
      )}
      {column.type === "photo" && (
        <div className="flex items-center gap-1.5 rounded-md border border-dashed border-royal-200 bg-royal-50/40 px-2 py-1.5 text-royal-400">
          <Image size={12} />
          <span className="text-xs">Upload</span>
        </div>
      )}
    </div>
  );
}

function AddFieldMenu({
  onAdd,
}: {
  onAdd: (def: PlayerListColumnTypeDef) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-dashed border-royal-300 px-3 py-1.5 text-xs font-medium text-royal-600 hover:bg-royal-100"
      >
        <Plus size={14} />
        Add field
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 flex w-44 flex-col gap-0.5 rounded-lg border border-royal-100 bg-white p-1 shadow-lg">
          {PLAYER_LIST_COLUMN_DEFS.map((columnDef) => {
            const Icon = columnDef.icon;
            return (
              <button
                key={columnDef.type}
                type="button"
                onClick={() => {
                  onAdd(columnDef);
                  setOpen(false);
                }}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-royal-700 hover:bg-royal-50"
              >
                <Icon size={13} />
                {columnDef.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LayoutSlider({
  sideBySide,
  onChange,
}: {
  sideBySide: boolean;
  onChange: (layout: "row" | "stacked") => void;
}) {
  return (
    <div className="relative flex w-56 rounded-full border border-royal-200 bg-white p-0.5 text-xs font-medium">
      <span
        className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-royal-600 transition-transform duration-200 ease-out ${
          sideBySide ? "translate-x-0" : "translate-x-full"
        }`}
      />
      <button
        type="button"
        onClick={() => onChange("row")}
        className={`relative z-10 flex-1 rounded-full px-3 py-1 transition-colors ${
          sideBySide ? "text-white" : "text-royal-600"
        }`}
      >
        Side by side
      </button>
      <button
        type="button"
        onClick={() => onChange("stacked")}
        className={`relative z-10 flex-1 rounded-full px-3 py-1 transition-colors ${
          !sideBySide ? "text-white" : "text-royal-600"
        }`}
      >
        Row by row
      </button>
    </div>
  );
}

