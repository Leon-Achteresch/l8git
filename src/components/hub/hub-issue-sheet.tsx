import { GhMarkdown } from "@/components/repo/github/gh-markdown";
import { MentionTextarea } from "@/components/repo/github/mention-textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toastError } from "@/lib/error-toast";
import { formatRelative } from "@/lib/format";
import { issueErrorMessage } from "@/lib/hub/issue-errors";
import { adapterFor, hubRepoPath } from "@/lib/hub/store";
import type { HubAccount, HubIssueDetail, HubIssueUpdate } from "@/lib/hub/types";
import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const chip = "h-6 gap-1 rounded-md px-2 text-[0.6875rem] text-muted-foreground hover:text-foreground";

/** View, edit, close and reopen an issue on providers without the GitHub issue sheet (GitLab, Bitbucket). */
export function HubIssueSheet({ account: a, fullName, number, url, onClose, onChanged }: {
  account: HubAccount; fullName: string; number: number; url: string; onClose: () => void; onChanged: () => void;
}) {
  const { t } = useTranslation();
  const ad = adapterFor(a);
  const [issue, setIssue] = useState<HubIssueDetail | null>(null);
  const [editing, setEditing] = useState<{ title: string; body: string } | null>(null);
  const [busy, setBusy] = useState<"edit" | "state" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    ad?.issue?.(a, fullName, number).then((i) => live && setIssue(i), (e) => live && setLoadError(issueErrorMessage(e)));
    return () => { live = false; };
  }, [a, fullName, number]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(kind: "edit" | "state", patch: HubIssueUpdate) {
    if (!issue || !ad?.updateIssue || busy) return;
    const before = issue;
    // Optimistic: show the new state at once, roll back if the provider refuses.
    setIssue({ ...issue, ...patch });
    setBusy(kind);
    try {
      setIssue(await ad.updateIssue(a, fullName, number, patch));
      if (kind === "edit") setEditing(null);
      onChanged();
    } catch (e) {
      setIssue(before);
      toastError(issueErrorMessage(e));
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
                {open ? t("hub.state.open") : t("hub.state.closed")}
              </span>
              <span>{issue.author?.login} · {formatRelative(issue.createdAt)}</span>
              <OpenButton url={issue.url} />
            </div>
          )}
        </SheetHeader>
        {loadError && !issue ? (
          <div className="space-y-2 p-4">
            <p role="alert" className="text-xs text-rose-500">{loadError}</p>
            <OpenButton url={url} />
          </div>
        ) : !issue ? (
          <Loader2 className="m-8 mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-1">
              <Button variant="ghost" size="sm" className={chip} disabled={!!editing} onClick={() => setEditing({ title: issue.title, body: issue.body })}>{t("ghx.edit")}</Button>
              <Button variant="ghost" size="sm" className={chip} disabled={busy !== null} onClick={() => void save("state", { state: open ? "closed" : "open" })}>
                {busy === "state" && <Loader2 className="h-3 w-3 animate-spin" />}
                {open ? t("issue.close") : t("ghx.reopenPr")}
              </Button>
            </div>
            {editing ? (
              <form className="space-y-1.5" onSubmit={(e) => { e.preventDefault(); if (editing.title.trim()) void save("edit", { title: editing.title.trim(), body: editing.body }); }}>
                <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} aria-label={t("hub.issue.title")} />
                <MentionTextarea path={hubRepoPath(a, fullName)} value={editing.body} onChange={(body) => setEditing({ ...editing, body })} placeholder={t("hub.issue.body")} rows={10} className="font-mono text-xs" />
                <div className="flex gap-1.5">
                  <Button type="submit" size="sm" disabled={!editing.title.trim() || busy !== null}>{busy === "edit" && <Loader2 className="animate-spin" />}{t("common.save")}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
                </div>
              </form>
            ) : issue.body ? (
              <GhMarkdown text={issue.body} />
            ) : (
              <p className="text-xs text-muted-foreground">{t("issue.noBody")}</p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function OpenButton({ url }: { url: string }) {
  const { t } = useTranslation();
  return (
    <Button variant="ghost" size="sm" className={chip} onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
      <ExternalLink className="h-3 w-3" />{t("hub.open")}
    </Button>
  );
}
