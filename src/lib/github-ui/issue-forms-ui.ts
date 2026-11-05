import type { FormAnswers, IssueForm } from "@/lib/github-expansion/forms";
import { listIssueTemplates, loadIssueTemplate, type IssueTemplate, type MarkdownIssueTemplate } from "@/lib/github-expansion/issue-forms";
import type { HubAccount } from "@/lib/hub/types";

export type TemplateEntry = IssueTemplate & ({ loaded: { kind: "form"; form: IssueForm } | { kind: "markdown"; template: MarkdownIssueTemplate } } | { loaded: null; error: string });

/** 26: lists `.github/ISSUE_TEMPLATE` (404 → none; permission/network errors propagate) and parses each; a broken file stays visible with its error. */
export async function loadTemplateEntries(a: HubAccount, repo: string): Promise<TemplateEntry[]> {
  const list = await listIssueTemplates(a, repo);
  return Promise.all(list.map(async (t): Promise<TemplateEntry> => {
    try {
      return { ...t, loaded: await loadIssueTemplate(a, repo, t) };
    } catch (e) {
      return { ...t, loaded: null, error: String(e) };
    }
  }));
}

export const templateLabel = (e: TemplateEntry) => (e.loaded?.kind === "form" ? e.loaded.form.name : e.loaded?.kind === "markdown" ? e.loaded.template.name : "") || e.name;

/** What selecting a template pre-fills. A caller-supplied title/body (e.g. issue from diff) is never overwritten. */
export function templatePrefill(e: TemplateEntry | null, initialTitle: string, initialBody: string) {
  if (!e?.loaded) return { title: initialTitle, body: initialBody, labels: [] as string[], assignees: [] as string[] };
  if (e.loaded.kind === "form") {
    const f = e.loaded.form;
    return { title: initialTitle || f.title, body: initialBody, labels: f.labels, assignees: f.assignees };
  }
  const m = e.loaded.template;
  return { title: initialTitle || m.title, body: initialBody ? `${m.body.trimEnd()}\n\n${initialBody}` : m.body, labels: m.labels, assignees: m.assignees };
}

export function initialAnswers(form: IssueForm): FormAnswers {
  return Object.fromEntries(form.fields.filter((f) => f.type !== "markdown").map((f) => [f.id, f.type === "checkboxes" ? f.options.map(() => false) : f.type === "dropdown" && f.multiple ? [] : f.value]));
}
