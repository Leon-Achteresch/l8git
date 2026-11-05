import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toastError } from "@/lib/error-toast";
import {
  listAssignees, listLabels, listMilestones, removeReviewers, requestReviewers, setLabels,
  setPullDraft, updateIssue, updatePullRequest,
  type GithubLabel, type GithubMilestone, type GithubUser,
} from "@/lib/github-expansion/api";
import { listCodeowners, matchCodeowners } from "@/lib/github-expansion/codeowners";
import type { PrGithubState } from "@/lib/github-ui/use-pr-github";
import { invoke } from "@tauri-apps/api/core";
import { CircleDot, FileEdit, GitBranch, GitPullRequestClosed, Milestone, Tag, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { PullRequestDetail } from "../pr/pull-request-inspect-detail";
import { GhPickPopover } from "./gh-pick-popover";
import { MentionTextarea } from "./mention-textarea";

const chip =
  "h-6 gap-1 rounded-md px-2 text-[0.6875rem] text-muted-foreground hover:text-foreground";

const labelName = (l: GithubLabel | string) => (typeof l === "string" ? l : l.name);

/** GitHub-only PR metadata actions. Rendered only when a connected GitHub account resolves the repo. */
export function PrGithubManage({
  path,
  number,
  detail,
  gh,
  onChanged,
}: {
  path: string;
  number: number;
  detail: PullRequestDetail;
  gh: PrGithubState;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [edit, setEdit] = useState(false);
  const [retarget, setRetarget] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { target, readiness, issue } = gh;
  if (!target) return null;
  const { account: a, fullName: repo } = target;
  const open = detail.state.toLowerCase() === "open";
  const canWrite = readiness?.viewerCanUpdate ?? false;

  async function run(id: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(id);
    try {
      await fn();
      if (done) toast.success(done);
      await gh.reload();
      onChanged();
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function codeownerSuggestions(): Promise<string[]> {
    const [files, owners] = await Promise.all([
      invoke<{ path: string }[]>("pr_files", { path, number }),
      listCodeowners(a, repo, detail.target_branch),
    ]);
    return [...matchCodeowners(owners.rules, files.map((f) => f.path)).keys()]
      .map((o) => o.replace(/^@/, ""))
      .filter((o) => o.toLowerCase() !== detail.author.toLowerCase());
  }

  const assignees = (issue?.assignees ?? []).map((u) => u.login);
  const labels = (issue?.labels ?? []).map(labelName);
  const requested = gh.meta
    ? gh.meta.reviewRequests.map((r) => (r.kind === "user" ? r.login : `${r.organization}/${r.slug}`))
    : detail.reviewers.map((r) => r.login);
  // Reviewed an older head → candidates for re-request.
  const stale = new Set((gh.meta?.latestReviews ?? []).filter((r) => r.commitOid && r.commitOid !== gh.meta?.headRefOid).map((r) => r.login));

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1" aria-label={t("ghx.manage")}>
      {!canWrite && readiness && <span className="mr-1 text-[0.625rem] text-muted-foreground">{t("ghx.readOnly")}</span>}
      {canWrite && (
        <>
          <Button variant="ghost" size="sm" className={chip} onClick={() => setEdit(true)}>
            <FileEdit className="h-3 w-3" />{t("ghx.edit")}
          </Button>
          {open && readiness && (
            <Button variant="ghost" size="sm" className={chip} disabled={busy === "draft"}
              onClick={() => void run("draft", () => setPullDraft(a, readiness.id, !detail.is_draft), detail.is_draft ? t("ghx.markedReady") : t("ghx.markedDraft"))}>
              <CircleDot className="h-3 w-3" />{detail.is_draft ? t("ghx.markReady") : t("ghx.convertDraft")}
            </Button>
          )}
          {detail.state.toLowerCase() !== "merged" && (
            <Button variant="ghost" size="sm" className={chip} disabled={busy === "state"}
              onClick={() => {
                if (open && !window.confirm(t("ghx.closeConfirm", { number }))) return;
                void run("state", () => updatePullRequest(a, repo, number, { state: open ? "closed" : "open" }));
              }}>
              <GitPullRequestClosed className="h-3 w-3" />{open ? t("ghx.closePr") : t("ghx.reopenPr")}
            </Button>
          )}
          {open && (
            <Button variant="ghost" size="sm" className={chip} onClick={() => setRetarget(true)}>
              <GitBranch className="h-3 w-3" />{t("ghx.changeBase")}
            </Button>
          )}
          <GhPickPopover
            title={t("ghx.labels")}
            trigger={<Button variant="ghost" size="sm" className={chip}><Tag className="h-3 w-3" />{t("ghx.labels")}</Button>}
            load={(p) => listLabels(a, repo, p)}
            toItem={(x) => { const l = x as GithubLabel; return { id: l.name, label: l.name, color: l.color, hint: l.description ?? undefined }; }}
            selected={labels}
            onApply={(ids) => run("labels", () => setLabels(a, repo, number, ids))}
          />
          <GhPickPopover
            title={t("ghx.assignees")}
            trigger={<Button variant="ghost" size="sm" className={chip}><Users className="h-3 w-3" />{assignees.length ? assignees.join(", ") : t("ghx.assignees")}</Button>}
            load={(p) => listAssignees(a, repo, p)}
            toItem={(x) => ({ id: (x as GithubUser).login, label: (x as GithubUser).login })}
            selected={assignees}
            onApply={(ids) => run("assignees", () => updateIssue(a, repo, number, { assignees: ids }))}
          />
          <GhPickPopover
            single
            title={t("ghx.milestone")}
            trigger={<Button variant="ghost" size="sm" className={chip}><Milestone className="h-3 w-3" />{issue?.milestone?.title ?? t("ghx.milestone")}</Button>}
            load={(p) => listMilestones(a, repo, p)}
            toItem={(x) => { const m = x as GithubMilestone; return { id: String(m.number), label: m.title, hint: m.due_on?.slice(0, 10) }; }}
            selected={issue?.milestone ? [String(issue.milestone.number)] : []}
            onApply={(ids) => run("milestone", () => updateIssue(a, repo, number, { milestone: ids[0] ? Number(ids[0]) : null }))}
          />
          {open && (
            <ReviewerPicker
              requested={requested}
              stale={stale}
              load={async (p) => {
                const page = await listAssignees(a, repo, p);
                if (p !== 1) return page;
                const owners = await codeownerSuggestions().catch((): string[] => []);
                return { ...page, items: [...owners.map((o) => ({ login: o, codeowner: true })), ...page.items.filter((u) => !owners.includes(u.login))] };
              }}
              onApply={(next) => {
                const toAdd = next.filter((x) => !requested.includes(x));
                const toRemove = requested.filter((x) => !next.includes(x));
                const split = (xs: string[]) => ({ users: xs.filter((x) => !x.includes("/")), teams: xs.filter((x) => x.includes("/")).map((x) => x.split("/")[1]) });
                const add = split(toAdd);
                const del = split(toRemove);
                return run("reviewers", async () => {
                  if (toRemove.length) await removeReviewers(a, repo, number, del.users, del.teams);
                  if (toAdd.length) await requestReviewers(a, repo, number, add.users, add.teams);
                });
              }}
            />
          )}
        </>
      )}
      {edit && (
        <EditDialog
          path={path}
          initialTitle={detail.title}
          initialBody={detail.body_markdown}
          onClose={() => setEdit(false)}
          onSave={(title, body) => run("edit", () => updatePullRequest(a, repo, number, { title, body })).then(() => setEdit(false))}
        />
      )}
      {retarget && (
        <RetargetDialog
          current={detail.target_branch}
          head={detail.source_branch}
          onClose={() => setRetarget(false)}
          onSave={(base) => run("base", () => updatePullRequest(a, repo, number, { base }), t("ghx.baseChanged", { base })).then(() => setRetarget(false))}
        />
      )}
    </div>
  );
}

function ReviewerPicker({
  requested,
  stale,
  load,
  onApply,
}: {
  requested: string[];
  stale: Set<string>;
  load: (page: number) => Promise<{ items: (GithubUser & { codeowner?: boolean })[]; page: number; hasMore: boolean }>;
  onApply: (ids: string[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <GhPickPopover
      title={t("ghx.reviewers")}
      trigger={<Button variant="ghost" size="sm" className={chip}><UserPlus className="h-3 w-3" />{t("ghx.reviewers")}</Button>}
      load={load}
      toItem={(x) => {
        const u = x as GithubUser & { codeowner?: boolean };
        const hints = [u.codeowner && t("ghx.codeowner"), stale.has(u.login) && t("ghx.reviewedOlder")].filter(Boolean);
        return { id: u.login, label: u.login, hint: hints.join(" · ") || undefined };
      }}
      selected={requested}
      extra={{
        placeholder: t("ghx.reviewerPlaceholder"),
        // `org/team` requests a team; a bare login requests a person (also re-requests after a review).
        accept: (v) => (/^[\w.-]+(\/[\w.-]+)?$/.test(v) ? v.replace(/^@/, "") : null),
      }}
      onApply={onApply}
    />
  );
}

function EditDialog({
  path,
  initialTitle,
  initialBody,
  onClose,
  onSave,
}: {
  path: string;
  initialTitle: string;
  initialBody: string;
  onClose: () => void;
  onSave: (title: string, body: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{t("ghx.editPr")}</DialogTitle></DialogHeader>
        <label className="text-xs font-medium">{t("ghx.title")}
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
        </label>
        <label className="text-xs font-medium">{t("ghx.body")}
          <MentionTextarea path={path} value={body} onChange={setBody} rows={12} className="mt-1 font-mono text-xs" />
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={busy || !title.trim() || (title === initialTitle && body === initialBody)}
            onClick={() => { setBusy(true); void onSave(title.trim(), body).finally(() => setBusy(false)); }}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RetargetDialog({
  current,
  head,
  onClose,
  onSave,
}: {
  current: string;
  head: string;
  onClose: () => void;
  onSave: (base: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [base, setBase] = useState(current);
  const [busy, setBusy] = useState(false);
  const next = base.trim();
  const invalid = !next || next === current || next === head || /\s|\.\.|^-/.test(next);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("ghx.changeBase")}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">{t("ghx.changeBaseHint", { current, head })}</p>
        <Input value={base} onChange={(e) => setBase(e.target.value)} aria-label={t("ghx.newBase")} className="font-mono text-xs" />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={busy || invalid} onClick={() => { setBusy(true); void onSave(next).finally(() => setBusy(false)); }}>
            {t("ghx.changeBaseTo", { base: next || "…" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
