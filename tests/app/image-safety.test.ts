import { describe, it, expect, beforeEach } from "vitest";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { resetDb } from "../helpers/db";
import { createTestAdmin, createTestForm } from "../helpers/fixtures";
import { saveFormImagesLocally, SCHEMA_ASSETS_ROOT } from "@/lib/local-storage";
import { LOCAL_STORAGE_ROOT } from "@/lib/storage-root";
import { GET as getSchemaAsset } from "@/app/api/forms/[formId]/schema-assets/[...path]/route";
import { DEFAULT_THEME } from "@/types/theme";
import type { FormField } from "@/types/form-builder";

const SVG_WITH_SCRIPT = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>`;
const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(SVG_WITH_SCRIPT).toString("base64")}`;
const pngDataUrl = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString("base64")}`;

function imageField(id: string, dataUrl: string): FormField {
  return { id, type: "image-display", label: id, required: false, imageDataUrl: dataUrl } as unknown as FormField;
}

beforeEach(async () => {
  await resetDb();
  await rm(LOCAL_STORAGE_ROOT, { recursive: true, force: true });
});

describe("saving form images", () => {
  it("never publishes an SVG as a file on this domain, but still saves PNGs", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id);

    const { fields } = await saveFormImagesLocally(
      form.id,
      [imageField("evil", svgDataUrl), imageField("ok", pngDataUrl)],
      DEFAULT_THEME,
    );

    const [evil, ok] = fields as unknown as { imageDataUrl: string }[];
    expect(evil.imageDataUrl).toBe("");
    expect(ok.imageDataUrl).toMatch(/^\/api\/forms\/.+\/schema-assets\/.+\.png$/);
    const saved = await readdir(path.join(SCHEMA_ASSETS_ROOT, form.id));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatch(/\.png$/);
  });
});

describe("serving form images", () => {
  it("sandboxes every image so an old SVG can't run script if opened directly", async () => {
    const admin = await createTestAdmin();
    const form = await createTestForm(admin.id);
    const dir = path.join(SCHEMA_ASSETS_ROOT, form.id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "old.svg"), SVG_WITH_SCRIPT);

    const response = await getSchemaAsset(new Request("http://localhost/x"), {
      params: Promise.resolve({ formId: form.id, path: ["old.svg"] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const csp = response.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("sandbox");
    expect(csp).toContain("default-src 'none'");
  });
});
