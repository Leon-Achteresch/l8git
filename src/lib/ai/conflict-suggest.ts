import type { ConflictBlock } from "@/lib/conflict-parser";
import { renderTemplate } from "@/lib/ai/prompts";

export const DEFAULT_CONFLICT_CONTEXT_LINES = 12;
export const MAX_CONFLICT_SIDE_CHARS = 12_000;
export const MAX_CONFLICT_BASE_CHARS = 8_000;
export const MAX_CONFLICT_CONTEXT_CHARS = 4_000;

const FENCE_OPEN = /^\s*(?:`{3,}|~{3,})/;
const FENCE_CLOSE = /^\s*(?:`{3,}|~{3,})\s*$/;
const CONFLICT_MARKER = /^(?:<{7}|={7}|>{7}|\|{7})/m;

export type ConflictSuggestionErrorKind = "empty" | "conflictMarkers";

export interface ConflictSuggestionSuccess {
  ok: true;
  content: string;
  lines: string[];
}

export interface ConflictSuggestionFailure {
  ok: false;
  kind: ConflictSuggestionErrorKind;
  messageKey: string;
}

export type ConflictSuggestionResult =
  | ConflictSuggestionSuccess
  | ConflictSuggestionFailure;

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start++;
  while (end > start && lines[end - 1].trim() === "") end--;
  return lines.slice(start, end);
}

export function clipForPrompt(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n…`;
}

export function stripMarkdownFences(text: string): string {
  const lines = normalizeNewlines(text).split("\n");
  const openIdx = lines.findIndex((line) => FENCE_OPEN.test(line));

  if (openIdx >= 0) {
    const preamble = lines.slice(0, openIdx).filter((line) => line.trim() !== "");
    if (preamble.length <= 2) {
      let closeIdx = lines.length;
      for (let i = lines.length - 1; i > openIdx; i--) {
        if (FENCE_CLOSE.test(lines[i])) {
          closeIdx = i;
          break;
        }
      }
      return trimBlankEdges(lines.slice(openIdx + 1, closeIdx)).join("\n");
    }
  }

  return trimBlankEdges(lines).join("\n");
}

export function containsConflictMarkers(text: string): boolean {
  return CONFLICT_MARKER.test(normalizeNewlines(text));
}

export function parseConflictSuggestion(raw: string): ConflictSuggestionResult {
  const content = stripMarkdownFences(raw ?? "");

  if (containsConflictMarkers(content)) {
    return {
      ok: false,
      kind: "conflictMarkers",
      messageKey: "mergeAi.errorConflictMarkers",
    };
  }

  if (content.trim() === "") {
    return { ok: false, kind: "empty", messageKey: "mergeAi.errorEmpty" };
  }

  return { ok: true, content, lines: content.split("\n") };
}

export function applyConflictSuggestion(
  text: string,
  block: ConflictBlock,
  suggestion: string,
): string {
  const lines = text.split("\n");
  const replacement = suggestion === "" ? [] : normalizeNewlines(suggestion).split("\n");
  return [
    ...lines.slice(0, block.startLine),
    ...replacement,
    ...lines.slice(block.endLine + 1),
  ].join("\n");
}

export function conflictBlockKey(block: ConflictBlock): string {
  return JSON.stringify([block.oursLines, block.theirsLines]);
}

export interface ConflictBlockContext {
  before: string[];
  after: string[];
}

export function conflictBlockContext(
  text: string,
  block: ConflictBlock,
  contextLines: number = DEFAULT_CONFLICT_CONTEXT_LINES,
): ConflictBlockContext {
  const lines = normalizeNewlines(text).split("\n");
  const span = Math.max(0, contextLines);
  return {
    before: lines.slice(Math.max(0, block.startLine - span), block.startLine),
    after: lines.slice(block.endLine + 1, block.endLine + 1 + span),
  };
}

export function extractBaseLines(text: string, block: ConflictBlock): string[] | null {
  const lines = normalizeNewlines(text).split("\n");
  let baseStart = -1;

  for (let i = block.startLine; i <= block.endLine && i < lines.length; i++) {
    if (lines[i].startsWith("|||||||")) {
      baseStart = i + 1;
      break;
    }
  }
  if (baseStart < 0) return null;

  const baseLines: string[] = [];
  for (let i = baseStart; i <= block.endLine && i < lines.length; i++) {
    if (lines[i].startsWith("=======")) return baseLines;
    baseLines.push(lines[i]);
  }
  return baseLines;
}

export type ConflictBaseKind = "region" | "file" | "none";

export interface ConflictBaseSnippet {
  kind: ConflictBaseKind;
  text: string;
}

export function resolveBaseSnippet(
  text: string,
  block: ConflictBlock,
  baseFile?: string,
): ConflictBaseSnippet {
  const region = extractBaseLines(text, block);
  if (region) {
    return {
      kind: "region",
      text: clipForPrompt(region.join("\n"), MAX_CONFLICT_BASE_CHARS),
    };
  }
  const file = baseFile?.trim() ?? "";
  if (file) {
    return { kind: "file", text: clipForPrompt(file, MAX_CONFLICT_BASE_CHARS) };
  }
  return { kind: "none", text: "" };
}

export type SuggestionRelation = "ours" | "theirs" | "both" | "custom";

function normalizedLines(lines: string[]): string {
  return trimBlankEdges(lines.map((line) => line.replace(/\s+$/, ""))).join("\n");
}

export function classifySuggestion(
  lines: string[],
  block: ConflictBlock,
): SuggestionRelation {
  const value = normalizedLines(lines);
  if (value === normalizedLines(block.oursLines)) return "ours";
  if (value === normalizedLines(block.theirsLines)) return "theirs";
  if (value === normalizedLines([...block.oursLines, ...block.theirsLines])) return "both";
  return "custom";
}

export type SuggestionDiffKind = "same" | "added" | "removed";

export interface SuggestionDiffLine {
  kind: SuggestionDiffKind;
  text: string;
}

const MAX_DIFF_CELLS = 250_000;

export function diffSuggestionLines(from: string[], to: string[]): SuggestionDiffLine[] {
  if (from.length === 0 && to.length === 0) return [];
  if (from.length * to.length > MAX_DIFF_CELLS) {
    return [
      ...from.map((text) => ({ kind: "removed" as const, text })),
      ...to.map((text) => ({ kind: "added" as const, text })),
    ];
  }

  const rows = from.length;
  const cols = to.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () =>
    new Array<number>(cols + 1).fill(0),
  );

  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      table[i][j] =
        from[i] === to[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const result: SuggestionDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (from[i] === to[j]) {
      result.push({ kind: "same", text: from[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      result.push({ kind: "removed", text: from[i] });
      i++;
    } else {
      result.push({ kind: "added", text: to[j] });
      j++;
    }
  }
  while (i < rows) result.push({ kind: "removed", text: from[i++] });
  while (j < cols) result.push({ kind: "added", text: to[j++] });

  return result;
}

export interface ConflictPromptInput {
  file: string;
  language: string;
  text: string;
  block: ConflictBlock;
  baseFile?: string;
  contextLines?: number;
}

export interface ConflictPrompt {
  system: string;
  prompt: string;
}

const BASE_NOTES: Record<ConflictBaseKind, string> = {
  region: "The base section is the common ancestor of exactly this conflicting region.",
  file: "The base section is the common ancestor of the whole file, not only of this region.",
  none: "No common ancestor is available for this conflict.",
};

export function buildConflictSuggestionPrompt(
  template: string,
  input: ConflictPromptInput,
): ConflictPrompt {
  const { file, language, text, block, baseFile } = input;
  const base = resolveBaseSnippet(text, block, baseFile);
  const ours = clipForPrompt(block.oursLines.join("\n"), MAX_CONFLICT_SIDE_CHARS);
  const theirs = clipForPrompt(block.theirsLines.join("\n"), MAX_CONFLICT_SIDE_CHARS);
  const context = conflictBlockContext(text, block, input.contextLines);
  const before = clipForPrompt(context.before.join("\n"), MAX_CONFLICT_CONTEXT_CHARS);
  const after = clipForPrompt(context.after.join("\n"), MAX_CONFLICT_CONTEXT_CHARS);

  const system = renderTemplate(template, {
    file,
    language,
    base: base.kind === "none" ? "(not available)" : base.text,
    ours,
    theirs,
  });

  const prompt = [
    `File: ${file}`,
    `Conflict region: line ${block.startLine + 1} to ${block.endLine + 1} of the working copy.`,
    `Our side is labelled "${block.oursLabel || "HEAD"}", their side is labelled "${block.theirsLabel || "incoming"}".`,
    BASE_NOTES[base.kind],
    "",
    "--- context before the conflict ---",
    before,
    "",
    "--- ours ---",
    ours,
    "",
    "--- theirs ---",
    theirs,
    "",
    "--- context after the conflict ---",
    after,
    "",
    "Reply with the replacement lines for the conflicting region only: exactly the text that should sit between the context before and the context after.",
    "Do not repeat the context, do not add conflict markers, do not wrap the answer in a markdown fence, do not explain anything.",
  ].join("\n");

  return { system, prompt };
}
