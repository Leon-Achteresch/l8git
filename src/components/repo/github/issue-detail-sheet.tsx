import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toastError } from "@/lib/error-toast";
import { formatRelative } from "@/lib/format";
import {
  addComment, addIssueDependency, addSubIssue, getIssue, listAssignees, listComments, listIssueDependencies, listLabels,
  listMilestones, listSubIssues, listSubjectProjects, removeIssueDependency, removeSubIssue, setLabels, updateIssue,
  updateProjectField,
  type GithubComment, type GithubIssue, type GithubLabel, type GithubMilestone, type GithubUser, type ProjectField, type ProjectFieldValue, type ProjectItem,
} from "@/lib/github-expansion/api";
import { loadAllProjectFields, projectFieldRows, type ProjectFieldRow } from "@/lib/github-ui/project-fields";
import { subjectKey, useGithubWorkspace } from "@/lib/github-expansion/store";
import { hubRepoPath } from "@/lib/hub/store";
import type { HubAccount } from "@/lib/hub/types";
import { ChevronDown, ExternalLink, Loader2, Milestone, Tag, Users, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { TemplateInsertMenu } from "./comment-templates";
import { GhMarkdown } from "./gh-markdown";
import { GhPickPopover } from "./gh-pick-popover";
import { IssueStartWork } from "./issue-start-work";
import { MentionTextarea } from "./mention-textarea";

const labelName = (l: GithubLabel | string) => (typeof l === "string" ? l : l.name);
const chip = "h-6 gap-1 rounded-md px-2 text-[0.6875rem] text-muted-foreground hover:text-foreground";

function Block({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-1.5 border-t border-border/50 pt-3">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold">{title}</h3>
        <span className="ml-auto">{action}</span>
      </div>
      {children}
    </section>
  );
}

/** Full GitHub issue: body, comments, metadata, state, hierarchy, dependencies, projects and private note. */
export function IssueDetailSheet({ account: a, fullName: repo, number, onClose, onChanged }: {
  account: HubAccount; fullName: string; number: number; onClose: () => void; onChanged: () => void;
}) {
  const { t } = useTranslation();
  const path = hubRepoPath(a, repo);
  const [issue, setIssue] = useState<GithubIssue | null>(null);
  const [comments, setComments] = useState<GithubComment[]>([]);
  const [commentPage, setCommentPage] = useState({ page: 0, hasMore: false });
  const [editing, setEditing] = useState<{ title: string; body: string } | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [i, c] = await Promise.all([getIssue(a, repo, number), listComments(a, repo, number, 1)]);
      setIssue(i);
      setComments(c.items);
      setCommentPage({ page: 1, hasMore: c.hasMore });
    } catch (e) {
      toastError(String(e));
    }
  }, [a, repo, number]);
  useEffect(() => void load(), [load]);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try {
      await fn();
      await load();
      onChanged();
      return true;
    } catch (e) {
      toastError(String(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const open = issue?.state === "open";
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle className="flex items-start gap-2 pr-6 text-sm">
            <span className="font-mono text-muted-foreground">#{number}</span>
            <span className="min-w-0 flex-1">{issue?.title ?? "…"}</span>
          </SheetTitle>
          {issue && (
            <div className="flex flex-wrap items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
              <span className={`rounded-full px-2 py-0.5 font-semibold ${open ? "bg-emerald-500/15 text-emerald-600" : "bg-violet-500/15 text-violet-600"}`}>
                {open ? t("hub.state.open") : issue.state_reason === "not_planned" ? t("issue.notPlanned") : t("hub.state.closed")}
              </span>
              <span>{issue.user?.login} · {formatRelative(issue.updated_at)}</span>
              <Button variant="ghost" size="sm" className={chip} onClick={() => window.open(issue.html_url, "_blank", "noopener,noreferrer")}>
                <ExternalLink className="h-3 w-3" />GitHub
              </Button>
            </div>
          )}
        </SheetHeader>
        {!issue ? (
          <Loader2 className="m-8 mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-1">
              <Button variant="ghost" size="sm" className={chip} onClick={() => setEditing({ title: issue.title, body: issue.body ?? "" })}>{t("ghx.edit")}</Button>
              {open ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className={chip} disabled={busy === "state"}>{t("issue.close")}<ChevronDown className="h-3 w-3" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => void run("state", () => updateIssue(a, repo, number, { state: "closed", state_reason: "completed" }))}>{t("issue.closeCompleted")}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void run("state", () => updateIssue(a, repo, number, { state: "closed", state_reason: "not_planned" }))}>{t("issue.closeNotPlanned")}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button variant="ghost" size="sm" className={chip} disabled={busy === "state"} onClick={() => void run("state", () => updateIssue(a, repo, number, { state: "open", state_reason: "reopened" }))}>{t("ghx.reopenPr")}</Button>
              )}
              <GhPickPopover
                title={t("ghx.labels")}
                trigger={<Button variant="ghost" size="sm" className={chip}><Tag className="h-3 w-3" />{issue.labels.length ? issue.labels.map(labelName).join(", ") : t("ghx.labels")}</Button>}
                load={(p) => listLabels(a, repo, p)}
                toItem={(x) => { const l = x as GithubLabel; return { id: l.name, label: l.name, color: l.color }; }}
                selected={issue.labels.map(labelName)}
                onApply={(ids) => run("labels", () => setLabels(a, repo, number, ids)).then(() => {})}
              />
              <GhPickPopover
                title={t("ghx.assignees")}
                trigger={<Button variant="ghost" size="sm" className={chip}><Users className="h-3 w-3" />{issue.assignees.length ? issue.assignees.map((u) => u.login).join(", ") : t("ghx.assignees")}</Button>}
                load={(p) => listAssignees(a, repo, p)}
                toItem={(x) => ({ id: (x as GithubUser).login, label: (x as GithubUser).login })}
                selected={issue.assignees.map((u) => u.login)}
                onApply={(ids) => run("assignees", () => updateIssue(a, repo, number, { assignees: ids })).then(() => {})}
              />
              <GhPickPopover
                single
                title={t("ghx.milestone")}
                trigger={<Button variant="ghost" size="sm" className={chip}><Milestone className="h-3 w-3" />{issue.milestone?.title ?? t("ghx.milestone")}</Button>}
                load={(p) => listMilestones(a, repo, p)}
                toItem={(x) => { const m = x as GithubMilestone; return { id: String(m.number), label: m.title }; }}
                selected={issue.milestone ? [String(issue.milestone.number)] : []}
                onApply={(ids) => run("milestone", () => updateIssue(a, repo, number, { milestone: ids[0] ? Number(ids[0]) : null })).then(() => {})}
              />
            </div>

            {editing ? (
              <div className="space-y-1.5">
                <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} aria-label={t("ghx.title")} />
                <MentionTextarea path={path} value={editing.body} onChange={(body) => setEditing({ ...editing, body })} rows={10} className="font-mono text-xs" />
                <div className="flex gap-1.5">
                  <Button size="sm" disabled={!editing.title.trim() || busy === "edit"} onClick={() => void run("edit", () => updateIssue(a, repo, number, { title: editing.title.trim(), body: editing.body })).then((ok) => ok && setEditing(null))}>{t("common.save")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
                </div>
              </div>
            ) : issue.body ? (
              <GhMarkdown text={issue.body} />
            ) : (
              <p className="text-xs text-muted-foreground">{t("issue.noBody")}</p>
            )}

            <IssueStartWork account={a} fullName={repo} issue={issue} comments={comments} />
            <PrivateNote account={a} repo={repo} number={number} />
            <Relations account={a} repo={repo} number={number} />
            <Projects account={a} nodeId={issue.node_id} />

            <Block title={t("issue.comments", { count: issue.comments })}>
              <ul className="space-y-2">
                {comments.map((c) => (
                  <li key={c.id} className="rounded-md border border-border/50 p-2">
                    <p className="mb-1 text-[0.625rem] text-muted-foreground">{c.user?.login} · {formatRelative(c.created_at)}</p>
                    <GhMarkdown text={c.body} />
                  </li>
                ))}
              </ul>
              {commentPage.hasMore && (
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => void listComments(a, repo, number, commentPage.page + 1).then((r) => {
                  setComments((p) => [...p, ...r.items]);
                  setCommentPage({ page: r.page, hasMore: r.hasMore });
                }, (e) => toastError(String(e)))}>{t("ghx.loadMore")}</Button>
              )}
              <MentionTextarea path={path} value={reply} onChange={setReply} rows={4} placeholder={t("issue.commentPlaceholder")} className="text-xs" />
              <div className="flex items-center gap-1.5">
                <TemplateInsertMenu current={reply} onInsert={(tpl) => setReply((p) => (p.trim() ? `${p}\n\n${tpl}` : tpl))} />
                <span className="flex-1" />
                <Button size="sm" disabled={!reply.trim() || busy === "comment"} onClick={() => void run("comment", () => addComment(a, repo, number, reply)).then((ok) => ok && setReply(""))}>
                  {t("issue.comment")}
                </Button>
              </div>
            </Block>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PrivateNote({ account, repo, number }: { account: HubAccount; repo: string; number: number }) {
  const { t } = useTranslation();
  const key = subjectKey(account, repo, "issue", number);
  const note = useGithubWorkspace((s) => s.subjects[key]?.note ?? "");
  const update = useGithubWorkspace((s) => s.updateSubject);
  const [v, setV] = useState(note);
  useEffect(() => setV(note), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Block title={t("mine.notes")}>
      <Textarea value={v} rows={3} onChange={(e) => setV(e.target.value)} onBlur={() => v !== note && update(key, { note: v || undefined })} placeholder={t("mine.notesPlaceholder")} className="text-xs" />
    </Block>
  );
}

function IssueList({ items, onRemove }: { items: GithubIssue[]; onRemove: (i: GithubIssue) => void }) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-0.5 text-xs">
      {items.map((i) => (
        <li key={i.id} className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${i.state === "open" ? "bg-emerald-500" : "bg-violet-500"}`} />
          <a href={i.html_url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">#{i.number} {i.title}</a>
          <Button variant="ghost" size="icon" className="h-5 w-5" aria-label={t("common.remove")} onClick={() => onRemove(i)}><X className="h-3 w-3" /></Button>
        </li>
      ))}
    </ul>
  );
}

/** 27: sub-issues and blocked-by / blocking dependencies. Adding resolves a typed number to the issue's database ID. */
function Relations({ account: a, repo, number }: { account: HubAccount; repo: string; number: number }) {
  const { t } = useTranslation();
  const [subs, setSubs] = useState<GithubIssue[] | null>(null);
  const [blockedBy, setBlockedBy] = useState<GithubIssue[] | null>(null);
  const [blocking, setBlocking] = useState<GithubIssue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addSub, setAddSub] = useState("");
  const [addDep, setAddDep] = useState("");
  const load = useCallback(() => {
    listSubIssues(a, repo, number).then((r) => setSubs(r.items), (e) => setError(String(e)));
    listIssueDependencies(a, repo, number, "blocked_by").then((r) => setBlockedBy(r.items), () => setBlockedBy(null));
    listIssueDependencies(a, repo, number, "blocking").then((r) => setBlocking(r.items), () => setBlocking(null));
  }, [a, repo, number]);
  useEffect(load, [load]);
  async function add(kind: "sub" | "dep", raw: string) {
    const n = Number(raw.replace(/^#/, ""));
    if (!Number.isSafeInteger(n) || n < 1) return;
    try {
      const target = await getIssue(a, repo, n);
      if (kind === "sub") await addSubIssue(a, repo, number, target.id);
      else await addIssueDependency(a, repo, number, target.id);
      kind === "sub" ? setAddSub("") : setAddDep("");
      load();
    } catch (e) {
      toastError(String(e));
    }
  }
  const adder = (v: string, set: (s: string) => void, kind: "sub" | "dep", label: string) => (
    <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); void add(kind, v); }}>
      <Input value={v} onChange={(e) => set(e.target.value)} placeholder="#123" aria-label={label} className="h-6 w-24 font-mono text-xs" />
      <Button type="submit" size="sm" variant="outline" className="h-6 text-[0.6875rem]" disabled={!/^#?\d+$/.test(v.trim())}>{label}</Button>
    </form>
  );
  return (
    <Block title={t("issue.relations")}>
      {error && <p className="text-[0.625rem] text-muted-foreground">{t("issue.relationsUnavailable", { error })}</p>}
      {subs && (
        <div className="space-y-1">
          <p className="text-[0.6875rem] font-medium">{t("issue.subIssues", { count: subs.length })}</p>
          <IssueList items={subs} onRemove={(i) => void removeSubIssue(a, repo, number, i.id).then(load, (e) => toastError(String(e)))} />
          {adder(addSub, setAddSub, "sub", t("issue.addSub"))}
        </div>
      )}
      {blockedBy && (
        <div className="space-y-1">
          <p className="text-[0.6875rem] font-medium">{t("issue.blockedBy", { count: blockedBy.length })}</p>
          <IssueList items={blockedBy} onRemove={(i) => void removeIssueDependency(a, repo, number, i.id).then(load, (e) => toastError(String(e)))} />
          {adder(addDep, setAddDep, "dep", t("issue.addBlocker"))}
        </div>
      )}
      {blocking && blocking.length > 0 && (
        <div>
          <p className="text-[0.6875rem] font-medium">{t("issue.blocking", { count: blocking.length })}</p>
          <ul className="text-xs">{blocking.map((i) => <li key={i.id}>#{i.number} {i.title}</li>)}</ul>
        </div>
      )}
    </Block>
  );
}

/** 28: project fields. Text/number/date via prompt; single-select via the project's real option IDs. */
function Projects({ account: a, nodeId }: { account: HubAccount; nodeId: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ProjectItem[] | null>(null);
  const [fields, setFields] = useState<Record<string, ProjectField[] | string>>({});
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => listSubjectProjects(a, nodeId).then((r) => setItems(r.items), (e) => setError(String(e))), [a, nodeId]);
  useEffect(() => void load(), [load]);
  const projectIds = [...new Set(items?.map((i) => i.project.id) ?? [])].join("\n");
  useEffect(() => {
    if (!projectIds) return;
    let live = true;
    for (const id of projectIds.split("\n")) {
      loadAllProjectFields(a, id).then((f) => live && setFields((p) => ({ ...p, [id]: f })), (e) => live && setFields((p) => ({ ...p, [id]: String(e) })));
    }
    return () => { live = false; };
  }, [a, projectIds]);
  if (error) return <Block title={t("issue.projects")}><p className="text-[0.625rem] text-muted-foreground">{t("issue.projectsUnavailable", { error })}</p></Block>;
  if (!items || items.length === 0) return null;
  async function save(item: ProjectItem, fieldId: string, value: ProjectFieldValue | null) {
    try {
      await updateProjectField(a, item.project.id, item.id, fieldId, value);
      await load();
    } catch (e) {
      toastError(t("issue.projectSaveFailed", { error: String(e) }));
    }
  }
  function edit(item: ProjectItem, row: ProjectFieldRow) {
    const raw = window.prompt(t("issue.projectEdit"), row.value);
    if (raw === null) return;
    if (row.kind === "number" && raw.trim() && !Number.isFinite(Number(raw))) return toastError(t("issue.projectBadNumber"));
    void save(item, row.fieldId, raw.trim() === "" ? null : row.kind === "number" ? { number: Number(raw) } : row.kind === "date" ? { date: raw.trim() } : { text: raw });
  }
  return (
    <Block title={t("issue.projects")}>
      {items.map((it) => {
        const defs = fields[it.project.id];
        const rows = projectFieldRows(it, Array.isArray(defs) ? defs : null);
        return (
          <div key={it.id} className="rounded-md border border-border/50 p-2 text-xs">
            <a href={it.project.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">{it.project.title}</a>
            {typeof defs === "string" && <p className="text-[0.625rem] text-amber-600">{t("issue.projectFieldsUnavailable", { error: defs })}</p>}
            <dl className="mt-1 grid grid-cols-[8rem_1fr] gap-x-2 gap-y-0.5">
              {rows.map((r) => (
                <div key={r.fieldId} className="contents">
                  <dt className="truncate text-muted-foreground">{r.name}</dt>
                  <dd>
                    {r.kind === "single_select" ? (
                      <select aria-label={r.name} value={r.optionId ?? ""} onChange={(e) => void save(it, r.fieldId, e.target.value ? { singleSelectOptionId: e.target.value } : null)}
                        className="h-6 rounded border border-input bg-transparent px-1 text-xs">
                        <option value="">—</option>
                        {r.options!.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    ) : r.kind === "unsupported" ? (
                      <span title={t("issue.projectReadOnly")}>{r.value || "—"}</span>
                    ) : (
                      <button type="button" className="hover:underline" onClick={() => edit(it, r)}>{r.value || "—"}</button>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </Block>
  );
}
