import type { GithubDownload } from "@/lib/github-expansion/api";

export const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;
/** Longest log text decoded for in-app display/search; larger logs must be saved instead. */
export const MAX_LOG_TEXT_BYTES = 16 * 1024 * 1024;

export function isZip(d: Pick<GithubDownload, "content_type" | "file_name">): boolean {
  return /zip/i.test(d.content_type) || /\.zip$/i.test(d.file_name);
}

export function base64Bytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Decodes a plain-text download; ZIP or oversized payloads are refused, never shown as garbage. */
export function decodeLogText(d: GithubDownload): string {
  if (isZip(d)) throw new Error("zip");
  if (d.size > MAX_LOG_TEXT_BYTES) throw new Error("too-large");
  return new TextDecoder("utf-8").decode(base64Bytes(d.base64));
}

const STAMP = /^\uFEFF?(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) ?/;
export type LogLine = { n: number; stamp: string | null; text: string; error: "marker" | "heuristic" | null; group: "start" | "end" | null };

// GitHub workflow commands are exact; the free-text pattern is a heuristic and is labelled as such in the UI.
const ERROR_MARKER = /^##\[error\]/;
const ERROR_HINT = /(^|[\s:[])(error|fatal|failed|failure|panicked)\b/i;

export function parseLog(text: string): LogLine[] {
  const raw = text.split(/\r?\n/);
  if (raw.length && raw[raw.length - 1] === "") raw.pop();
  return raw.map((line, i) => {
    const m = STAMP.exec(line);
    const body = m ? line.slice(m[0].length) : line;
    return {
      n: i + 1,
      stamp: m ? m[1] : null,
      text: body,
      error: ERROR_MARKER.test(body) ? "marker" : ERROR_HINT.test(body) ? "heuristic" : null,
      group: body.startsWith("##[group]") ? "start" : body.startsWith("##[endgroup]") ? "end" : null,
    };
  });
}

/** Case-insensitive literal search; `null` query means no filter. Returns line indexes, capped. */
export function searchLog(lines: LogLine[], query: string, cap = 2000): { hits: number[]; capped: boolean } {
  const q = query.trim().toLowerCase();
  const hits: number[] = [];
  if (!q) return { hits, capped: false };
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].text.toLowerCase().includes(q)) {
      if (hits.length === cap) return { hits, capped: true };
      hits.push(i);
    }
  }
  return { hits, capped: false };
}

export function snippet(lines: LogLine[], from: number, to: number, withStamps: boolean): string {
  const [a, b] = from <= to ? [from, to] : [to, from];
  return lines.slice(Math.max(0, a), b + 1).map((l) => (withStamps && l.stamp ? `${l.stamp} ${l.text}` : l.text)).join("\n");
}

/** Error lines to step through: exact `##[error]` markers if present, otherwise heuristic matches. */
export function errorLines(lines: LogLine[]): { kind: "marker" | "heuristic"; indexes: number[] } {
  const markers = lines.flatMap((l, i) => (l.error === "marker" ? [i] : []));
  if (markers.length) return { kind: "marker", indexes: markers };
  return { kind: "heuristic", indexes: lines.flatMap((l, i) => (l.error === "heuristic" ? [i] : [])) };
}
