import { isRecord } from "@/lib/agents/plugins/content";

export interface ImageResult {
  images: { src: string; alt: string }[];
  text: string;
}

function dataUrl(mime: unknown, data: unknown): string | null {
  if (typeof mime !== "string" || !mime.startsWith("image/")) return null;
  if (typeof data !== "string" || !data) return null;
  return data.startsWith("data:") ? data : `data:${mime};base64,${data}`;
}

function imageSource(block: Record<string, unknown>): string | null {
  const direct = dataUrl(block.mimeType ?? block.mediaType, block.data);
  if (direct) return direct;
  const source = isRecord(block.source) ? block.source : null;
  if (source) {
    const nested = dataUrl(source.media_type ?? source.mediaType, source.data);
    if (nested) return nested;
    if (typeof source.url === "string") return source.url;
  }
  return typeof block.url === "string" ? block.url : null;
}

/**
 * Bild-Content-Blocks aus einem Tool-Ergebnis (Screenshots, Exporte, Renderings).
 * Ohne das landet der Base64-Blob als Textwueste im JSON-Block.
 */
export function parseImageResult(result: unknown): ImageResult | null {
  if (!Array.isArray(result)) return null;
  const blocks = result.filter(isRecord);
  const images: ImageResult["images"] = [];
  const texts: string[] = [];
  for (const block of blocks) {
    if (block.type === "image") {
      const src = imageSource(block);
      if (src) images.push({ src, alt: typeof block.alt === "string" ? block.alt : "Tool-Ergebnis" });
      continue;
    }
    if (block.type === "text" && typeof block.text === "string") texts.push(block.text);
  }
  return images.length > 0 ? { images, text: texts.join("\n").trim() } : null;
}
