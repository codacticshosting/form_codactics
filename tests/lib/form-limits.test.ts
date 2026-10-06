import { describe, it, expect } from "vitest";
import {
  effectiveDraftLimit,
  effectivePublishedLimit,
  MAX_DRAFTS_PER_ADMIN,
  MAX_PUBLISHED_PER_ADMIN,
} from "@/lib/form-limits";

describe("effectiveDraftLimit", () => {
  it("falls back to the default when there's no override", () => {
    expect(effectiveDraftLimit({ maxDrafts: null })).toBe(MAX_DRAFTS_PER_ADMIN);
  });

  it("uses the admin's override when set", () => {
    expect(effectiveDraftLimit({ maxDrafts: 10 })).toBe(10);
  });

  it("respects an override of 0 rather than treating it as unset", () => {
    expect(effectiveDraftLimit({ maxDrafts: 0 })).toBe(0);
  });
});

describe("effectivePublishedLimit", () => {
  it("falls back to the default when there's no override", () => {
    expect(effectivePublishedLimit({ maxPublished: null })).toBe(MAX_PUBLISHED_PER_ADMIN);
  });

  it("uses the admin's override when set", () => {
    expect(effectivePublishedLimit({ maxPublished: 25 })).toBe(25);
  });
});
