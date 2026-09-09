export interface LocalResumeCursor {
  lastSequence: number;
  updatedAt: number;
}

export interface NativeSessionMeta {
  mtime: number;
  messageCount: number;
}

export type ExternalChangeReason = "newMessages" | "modifiedAfterCursor" | "none";

export interface ExternalChangeResult {
  changed: boolean;
  reason: ExternalChangeReason;
}

export function detectExternalChange(
  local: LocalResumeCursor | null,
  native: NativeSessionMeta,
): ExternalChangeResult {
  if (!local) {
    return native.messageCount > 0
      ? { changed: true, reason: "newMessages" }
      : { changed: false, reason: "none" };
  }

  if (native.messageCount > local.lastSequence) {
    return { changed: true, reason: "newMessages" };
  }

  if (native.mtime > local.updatedAt) {
    return { changed: true, reason: "modifiedAfterCursor" };
  }

  return { changed: false, reason: "none" };
}
