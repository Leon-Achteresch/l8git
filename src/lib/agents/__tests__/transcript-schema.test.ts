import { describe, expect, it } from "vitest";

import {
  TRANSCRIPT_SCHEMA_VERSION,
  ensureTranscriptSchema,
  migrateTranscriptV0ToV1,
} from "@/lib/agents/transcript-schema";
import { exportTranscriptText } from "@/lib/agents/transcript-text";

describe("migrateTranscriptV0ToV1", () => {
  it("adds a schemaVersion field to legacy data", () => {
    const migrated = migrateTranscriptV0ToV1({ text: "hello" });
    expect(migrated).toEqual({ text: "hello", schemaVersion: 1 });
  });
});

describe("ensureTranscriptSchema", () => {
  it("migrates unversioned data and leaves current data untouched", () => {
    expect(ensureTranscriptSchema({ text: "a" }).schemaVersion).toBe(1);
    expect(
      ensureTranscriptSchema({ text: "a", schemaVersion: TRANSCRIPT_SCHEMA_VERSION }).schemaVersion,
    ).toBe(TRANSCRIPT_SCHEMA_VERSION);
  });
});

describe("exportTranscriptText", () => {
  it("prefixes exported text with a schema header", () => {
    const result = exportTranscriptText("hello world");
    expect(result).toContain("l8git-transcript-schema:1");
    expect(result).toContain("hello world");
  });
});
