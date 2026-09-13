export const TRANSCRIPT_SCHEMA_VERSION = 1 as const;

export interface VersionedTranscript {
  schemaVersion: number;
  [key: string]: unknown;
}

export function migrateTranscriptV0ToV1<T extends Record<string, unknown>>(
  data: T,
): T & { schemaVersion: 1 } {
  return {
    ...data,
    schemaVersion: 1,
  };
}

export function ensureTranscriptSchema<T extends Record<string, unknown>>(
  data: T,
): T & { schemaVersion: number } {
  const version = typeof data.schemaVersion === "number" ? data.schemaVersion : 0;
  if (version >= TRANSCRIPT_SCHEMA_VERSION) {
    return data as T & { schemaVersion: number };
  }
  if (version === 0) {
    return migrateTranscriptV0ToV1(data);
  }
  return { ...data, schemaVersion: TRANSCRIPT_SCHEMA_VERSION };
}

export function transcriptSchemaHeader(version: number = TRANSCRIPT_SCHEMA_VERSION): string {
  return `<!-- l8git-transcript-schema:${version} -->`;
}
