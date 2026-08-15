export type MediaFileBytes = {
  base64: string;
  mime: string;
  size: number;
  isBinary: boolean;
};

export type LfsPointerInfo = {
  isPointer: boolean;
  oid: string | null;
  size: number | null;
};

export const FILE_TOO_LARGE_PREFIX = "__FILE_TOO_LARGE__";
export const LFS_UNAVAILABLE_MARKER = "__LFS_UNAVAILABLE__";
export const LFS_POINTER_MARKER = "git-lfs.github.com/spec/v1";

export const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "jfif",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "cur",
  "avif",
  "apng",
]);

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];

const MISSING_PATH_HINTS = [
  "does not exist in",
  "exists on disk, but not in",
  "unknown revision or path not in the working tree",
  "no such file or directory",
  "not a valid object name",
  "invalid object name",
  "bad revision",
];

export function fileExtension(filePath: string): string {
  const name = filePath.trim().split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function isImagePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(fileExtension(filePath));
}

export function isImageMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  return mime.startsWith("image/");
}

export function mediaDataUrl(mime: string, base64: string): string {
  const type = mime.trim() || "application/octet-stream";
  return `data:${type};base64,${base64}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${Math.round(bytes)} ${SIZE_UNITS[0]}`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${SIZE_UNITS[unit]}`;
}

export function parseFileTooLarge(error: unknown): number | null {
  const text = String(error ?? "");
  const at = text.indexOf(FILE_TOO_LARGE_PREFIX);
  if (at < 0) return null;
  const rest = text.slice(at + FILE_TOO_LARGE_PREFIX.length);
  const parsed = Number.parseInt(rest.replace(/^\s*\|\s*/, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isMissingPathError(error: unknown): boolean {
  const text = String(error ?? "").toLowerCase();
  if (!text) return false;
  return MISSING_PATH_HINTS.some((hint) => text.includes(hint));
}

export function isLfsUnavailable(error: unknown): boolean {
  return String(error ?? "").includes(LFS_UNAVAILABLE_MARKER);
}

export function looksLikeLfsPointerText(
  text: string | null | undefined,
): boolean {
  if (!text) return false;
  return text.includes(LFS_POINTER_MARKER);
}

export function shortOid(oid: string | null | undefined, length = 10): string {
  const raw = (oid ?? "").trim().replace(/^sha256:/i, "");
  if (!raw) return "";
  return raw.length > length ? raw.slice(0, length) : raw;
}
