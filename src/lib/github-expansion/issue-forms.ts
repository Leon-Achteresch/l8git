import type { HubAccount } from "@/lib/hub/types";
import { createIssue, listRepositoryDirectory, readTemplate, type GithubIssue } from "./api";
import { parseIssueForm, parseRepositoryYaml, renderIssueAnswers, type FormAnswers, type IssueForm } from "./forms";

export type IssueTemplate = { path: string; name: string; sha: string; kind: "form" | "markdown" };
export async function listIssueTemplates(a: HubAccount, repo: string, ref?: string): Promise<IssueTemplate[]> {
  try {
    const entries = await listRepositoryDirectory(a, repo, ".github/ISSUE_TEMPLATE", ref);
    return entries.filter(entry => entry.type === "file" && /\.(?:ya?ml|md)$/i.test(entry.name) && !/^config\.ya?ml$/i.test(entry.name))
      .map(entry => ({ path: entry.path, name: entry.name, sha: entry.sha, kind: /\.md$/i.test(entry.name) ? "markdown" : "form" }));
  } catch (error) {
    if (/(?:^|\s)404(?:\s|:|$)/.test(String(error))) return [];
    throw error;
  }
}
export type MarkdownIssueTemplate = { name: string; description: string; title: string; labels: string[]; assignees: string[]; body: string };
export function parseMarkdownIssueTemplate(raw: string): MarkdownIssueTemplate {
  if (raw.length > 256_000) throw new Error("Issue template exceeds the 256 KB limit.");
  let meta: Record<string, unknown> = {}, body = raw;
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  if (match) {
    const parsed = parseRepositoryYaml(match[1]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid issue template metadata.");
    meta = parsed as Record<string, unknown>; body = raw.slice(match[0].length);
  }
  const text = (key: string) => typeof meta[key] === "string" ? meta[key] as string : "";
  const list = (key: string) => Array.isArray(meta[key]) ? (meta[key] as unknown[]).filter((v): v is string => typeof v === "string") : text(key).split(",").map(v => v.trim()).filter(Boolean);
  return { name: text("name"), description: text("about"), title: text("title"), labels: list("labels"), assignees: list("assignees"), body };
}
export async function loadIssueTemplate(a: HubAccount, repo: string, template: IssueTemplate, ref?: string): Promise<{ kind: "form"; form: IssueForm } | { kind: "markdown"; template: MarkdownIssueTemplate }> {
  const raw = await readTemplate(a, repo, template.path, ref);
  return template.kind === "form" ? { kind: "form", form: parseIssueForm(raw) } : { kind: "markdown", template: parseMarkdownIssueTemplate(raw) };
}
export function submitIssueForm(a: HubAccount, repo: string, title: string, form: IssueForm, answers: FormAnswers): Promise<GithubIssue> {
  return createIssue(a, repo, title, renderIssueAnswers(form, answers), { labels: form.labels, assignees: form.assignees });
}
