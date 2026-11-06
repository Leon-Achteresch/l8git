import { invoke } from "@/lib/platform/ipc";

export type SelectedSuggestion = { id: string; file: string; startLine: number; endLine: number; expectedLines: string[]; replacementLines: string[] };
export type SuggestionEdit = { file: string; expected_content: string; content: string };
export type SuggestionPlan = { path: string; head: string; suggestionIds: string[]; edits: SuggestionEdit[] };

/** Verify original ranges and apply backwards so earlier line numbers remain stable. */
export function applySelectedSuggestions(content: string, suggestions: SelectedSuggestion[]): string {
  const crlf = content.includes("\r\n"), normalized = content.replace(/\r\n/g, "\n"), trailing = normalized.endsWith("\n");
  const lines = normalized ? normalized.split("\n") : [];
  if (trailing) lines.pop();
  const sorted = [...suggestions].sort((a, b) => a.startLine - b.startLine);
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (!Number.isSafeInteger(s.startLine) || !Number.isSafeInteger(s.endLine) || s.startLine < 1 || s.endLine < s.startLine || s.endLine > lines.length
      || i > 0 && sorted[i - 1].endLine >= s.startLine) throw new Error("Suggestion ranges are invalid or overlap.");
    if ([...s.expectedLines, ...s.replacementLines].some(line => /[\r\n\0]/.test(line))) throw new Error("Suggestion lines must contain plain text without embedded newlines.");
    const actual = lines.slice(s.startLine - 1, s.endLine);
    if (actual.length !== s.expectedLines.length || actual.some((line, index) => line !== s.expectedLines[index])) throw new Error(`Suggestion no longer matches ${s.file}:${s.startLine}.`);
  }
  const result = [...lines];
  for (const s of sorted.reverse()) result.splice(s.startLine - 1, s.endLine - s.startLine + 1, ...s.replacementLines);
  const joined = result.join("\n") + (trailing && result.length ? "\n" : "");
  return crlf ? joined.replace(/\n/g, "\r\n") : joined;
}

export async function previewSuggestions(path: string, head: string, suggestions: SelectedSuggestion[]): Promise<SuggestionPlan> {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(head) || !suggestions.length || suggestions.length > 100) throw new Error("Select suggestions and their full reviewed commit ID.");
  const byFile = new Map<string, SelectedSuggestion[]>();
  for (const s of suggestions) byFile.set(s.file, [...byFile.get(s.file) ?? [], s]);
  const edits: SuggestionEdit[] = [];
  for (const [file, entries] of byFile) {
    const before = await invoke<string>("repo_read_file", { path, file });
    edits.push({ file, expected_content: before, content: applySelectedSuggestions(before, entries) });
  }
  return { path, head, suggestionIds: suggestions.map(s => s.id), edits };
}
export function applySuggestionPlan(plan: SuggestionPlan): Promise<void> {
  return invoke("hub_apply_suggestions", { path: plan.path, expectedHead: plan.head, edits: plan.edits });
}
