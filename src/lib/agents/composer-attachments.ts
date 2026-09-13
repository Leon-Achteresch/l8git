import { dataUrlToBytes } from "@/lib/media";

export type AttachmentSource = "file" | "paste" | "drop";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export const ALLOWED_FILE_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "text/csv",
  "application/json",
  "text/x-python",
  "text/x-typescript",
  "text/x-rust",
  "text/x-go",
  "application/javascript",
  "text/javascript",
  "text/x-c",
  "text/x-c++",
  "text/x-java",
] as const;

export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];
export type AllowedFileMime = (typeof ALLOWED_FILE_MIME_TYPES)[number];

export interface RawImageInput {
  source: AttachmentSource;
  mime: string;
  bytes?: Uint8Array | ArrayBuffer | null;
  dataUrl?: string | null;
  path?: string | null;
  name?: string;
}

export interface RawFileInput {
  source: AttachmentSource;
  mime: string;
  bytes?: Uint8Array | ArrayBuffer | null;
  path?: string | null;
  name?: string;
}

export interface NormalizedImageAttachment {
  kind: "image";
  mediaType: AllowedImageMime;
  data?: string;
  path?: string;
  name?: string;
  error?: string;
}

export interface NormalizedFileAttachment {
  kind: "file";
  mediaType: AllowedFileMime | "unknown";
  data?: string;
  path?: string;
  name?: string;
  error?: string;
}

export type ClaudeContentBlock =
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "text"; text: string };

function toByteLength(bytes: Uint8Array | ArrayBuffer): number {
  return bytes instanceof ArrayBuffer ? bytes.byteLength : bytes.byteLength;
}

const BASE64_CHUNK_SIZE = 0x8000;

function toBase64(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  if (typeof Buffer !== "undefined") return Buffer.from(view).toString("base64");
  if (typeof btoa !== "function") throw new Error("no base64 encoder available");
  let binary = "";
  for (let offset = 0; offset < view.length; offset += BASE64_CHUNK_SIZE) {
    const chunk = view.subarray(offset, offset + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function normalizeImageAttachment(input: RawImageInput): NormalizedImageAttachment {
  const mime = input.mime.toLowerCase();
  if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime)) {
    return { kind: "image", mediaType: mime as AllowedImageMime, error: `Nicht unterstuetzter Bildtyp: ${input.mime}` };
  }
  const mediaType = mime as AllowedImageMime;
  let bytes: Uint8Array | ArrayBuffer | null = input.bytes ?? null;
  if (!bytes && input.dataUrl) {
    const decoded = dataUrlToBytes(input.dataUrl);
    if (!decoded) {
      return { kind: "image", mediaType, error: "Ungueltige Bild-Data-URL" };
    }
    bytes = decoded.bytes;
  }
  if (input.path && !bytes) {
    return { kind: "image", mediaType, path: input.path, name: input.name };
  }
  if (!bytes) {
    return { kind: "image", mediaType, error: "Keine Bilddaten vorhanden" };
  }
  const size = toByteLength(bytes);
  if (size <= 0) {
    return { kind: "image", mediaType, error: "Bilddatei ist leer oder beschaedigt" };
  }
  if (size > MAX_IMAGE_BYTES) {
    return { kind: "image", mediaType, error: `Bild ueberschreitet das Limit von ${MAX_IMAGE_BYTES} Bytes` };
  }
  return { kind: "image", mediaType, data: toBase64(bytes), name: input.name };
}

function fileMediaType(mime: string): AllowedFileMime | "unknown" {
  const normalized = mime.toLowerCase();
  return (ALLOWED_FILE_MIME_TYPES as readonly string[]).includes(normalized)
    ? (normalized as AllowedFileMime)
    : "unknown";
}

export function normalizeFileAttachment(input: RawFileInput): NormalizedFileAttachment {
  const mediaType = fileMediaType(input.mime);
  if (mediaType === "unknown") {
    return { kind: "file", mediaType, error: `Nicht unterstuetzter Dateityp: ${input.mime}` };
  }
  if (input.path && !input.bytes) {
    return { kind: "file", mediaType, path: input.path, name: input.name };
  }
  if (!input.bytes) {
    return { kind: "file", mediaType, error: "Keine Dateidaten vorhanden" };
  }
  const size = toByteLength(input.bytes);
  if (size <= 0) {
    return { kind: "file", mediaType, error: "Datei ist leer oder beschaedigt" };
  }
  if (size > MAX_FILE_BYTES) {
    return { kind: "file", mediaType, error: `Datei ueberschreitet das Limit von ${MAX_FILE_BYTES} Bytes` };
  }
  return { kind: "file", mediaType, data: toBase64(input.bytes), name: input.name };
}

export function toClaudeContentBlock(
  attachment: NormalizedImageAttachment | NormalizedFileAttachment,
): ClaudeContentBlock {
  if (attachment.error) {
    return { type: "text", text: `[Anhang fehlgeschlagen: ${attachment.error}]` };
  }
  if (attachment.data) {
    const mediaType = attachment.mediaType === "unknown" ? "application/octet-stream" : attachment.mediaType;
    if (attachment.kind === "image") {
      return { type: "image", source: { type: "base64", media_type: mediaType, data: attachment.data } };
    }
    return { type: "document", source: { type: "base64", media_type: mediaType, data: attachment.data } };
  }
  if (attachment.path) {
    return { type: "text", text: `@${attachment.path}` };
  }
  return { type: "text", text: "[Anhang ohne Daten]" };
}

export function toClaudeFileBlock(
  attachment: NormalizedFileAttachment,
  supportsDocumentBlocks: boolean,
): ClaudeContentBlock {
  if (attachment.error) {
    return { type: "text", text: `[Anhang fehlgeschlagen: ${attachment.error}]` };
  }
  if (attachment.mediaType === "unknown") {
    return { type: "text", text: "[Anhang nicht unterstuetzt: unbekannter Dateityp]" };
  }
  if (supportsDocumentBlocks && attachment.data) {
    return {
      type: "document",
      source: { type: "base64", media_type: attachment.mediaType, data: attachment.data },
    };
  }
  if (attachment.path) {
    return { type: "text", text: `@${attachment.path}` };
  }
  if (!supportsDocumentBlocks) {
    return { type: "text", text: "[Anhang nicht unterstuetzt: keine Dokument-Capability]" };
  }
  return { type: "text", text: "[Anhang ohne Daten]" };
}

export interface ClipboardImageItem {
  type: string;
  getAsFile?: () => { arrayBuffer: () => Promise<ArrayBuffer>; name?: string } | null;
}

export async function clipboardImageToAttachment(
  items: ClipboardImageItem[] | null | undefined,
): Promise<NormalizedImageAttachment | null> {
  if (!items) return null;
  for (const item of items) {
    if (!item.type || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile?.();
    if (!file) continue;
    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch {
      continue;
    }
    return normalizeImageAttachment({
      source: "paste",
      mime: item.type,
      bytes,
      name: file.name,
    });
  }
  return null;
}

export interface QuestionAnswerPayload {
  text: string;
  attachments?: ClaudeContentBlock[];
}

export function buildQuestionAnswer(
  answers: string[],
  attachments: (NormalizedImageAttachment | NormalizedFileAttachment)[],
  supportsAttachments: boolean,
): QuestionAnswerPayload {
  const text = answers.map((entry) => entry.trim()).filter((entry) => entry.length > 0).join("\n");
  if (!supportsAttachments) {
    const refs = attachments
      .map((entry) => {
        if (entry.error) return `[Anhang fehlgeschlagen: ${entry.error}]`;
        if (entry.path) return `@${entry.path}`;
        return entry.name ? `[Anhang nicht übertragen: ${entry.name}]` : "[Anhang nicht übertragen]";
      });
    return { text: refs.length > 0 ? [text, refs.join(" ")].filter(Boolean).join("\n") : text };
  }
  return {
    text,
    attachments: attachments.map((entry) =>
      entry.kind === "image" ? toClaudeContentBlock(entry) : toClaudeFileBlock(entry, true),
    ),
  };
}
