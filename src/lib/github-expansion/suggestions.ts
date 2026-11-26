import { applyReviewLineEdits } from "@/lib/pr-suggestions";
import { invoke } from "@/lib/platform/ipc";

export type SelectedSuggestion = { id: string; file: string; startLine: number; endLine: number; expectedLines: string[]; replacementLines: string[] };
export type SuggestionEdit = { file: string; expected_content: string; content: string };
export type SuggestionPlan = { path: string; head: string; suggestionIds: string[]; edits: SuggestionEdit[] };

export function applySelectedSuggestions(content: string, suggestions: SelectedSuggestion[]): string {
  return applyReviewLineEdits(content, suggestions);
}

export function previewFileSuggestions(content: string, suggestions: readonly SelectedSuggestion[]) {
  const stale = new Map<string, string>();
  const next = applyReviewLineEdits(content, suggestions, (edit, reason) => stale.set(edit.id, reason));
  return { next, stale };
}

export type SuggestionPreview = { plan: SuggestionPlan | null; stale: Map<string, string> };

export async function previewSuggestions(path: string, head: string, suggestions: SelectedSuggestion[]): Promise<SuggestionPreview> {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(head) || !suggestions.length || suggestions.length > 100) throw new Error("Select suggestions and their full reviewed commit ID.");
  const byFile = new Map<string, SelectedSuggestion[]>();
  for (const suggestion of suggestions) {
    const group = byFile.get(suggestion.file);
    if (group) group.push(suggestion);
    else byFile.set(suggestion.file, [suggestion]);
  }
  const edits: SuggestionEdit[] = [];
  const stale = new Map<string, string>();
  for (const [file, entries] of byFile) {
    const before = await invoke<string>("repo_read_file", { path, file });
    const result = previewFileSuggestions(before, entries);
    for (const [id, reason] of result.stale) stale.set(id, reason);
    if (result.stale.size < entries.length) edits.push({ file, expected_content: before, content: result.next });
  }
  const suggestionIds = suggestions.filter(s => !stale.has(s.id)).map(s => s.id);
  return { plan: edits.length ? { path, head, suggestionIds, edits } : null, stale };
}
export function applySuggestionPlan(plan: SuggestionPlan): Promise<void> {
  return invoke("hub_apply_suggestions", { path: plan.path, expectedHead: plan.head, edits: plan.edits });
}
