export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** MCP-Ergebnisse kommen als String oder als Content-Block-Liste an. */
export function resultText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return null;
  const texts = value
    .filter(isRecord)
    .filter((block) => block.type === "text")
    .map((block) => (typeof block.text === "string" ? block.text : ""));
  return texts.length > 0 ? texts.join("\n") : null;
}

/** Letztes Segment eines Tool-Namens, z. B. mcp__oracle-readonly__execute_query -> execute_query. */
export function baseToolName(tool: unknown): string {
  if (typeof tool !== "string") return "";
  const parts = tool.split("__");
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

const SECRET_KEY_PATTERN = /token|secret|password|passwd|api[_-]?key|authorization|credential/i;

export function looksSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

export function redactSecrets(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = looksSecretKey(key) ? "[redacted]" : value;
  }
  return out;
}

const IMAGE_MEDIA_TYPE_PATTERN = /^image\//i;

export function isImageContentBlock(block: unknown): boolean {
  if (!isRecord(block)) return false;
  if (block.type !== "image") return false;
  const source = isRecord(block.source) ? block.source : null;
  const mediaType = source ? source.media_type : block.media_type;
  return typeof mediaType === "string" && IMAGE_MEDIA_TYPE_PATTERN.test(mediaType);
}

export function hasImageContent(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some(isImageContentBlock);
}
