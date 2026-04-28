import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toastError } from "@/lib/error-toast";
import { invoke } from "@tauri-apps/api/core";
import {
  CheckCheck,
  Download,
  GitMerge,
  MessageSquarePlus,
  ThumbsDown,
} from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PullRequestDetail } from "./pull-request-inspect-detail";

type MergeStrategy = "merge" | "squash" | "rebase";

export function PullRequestOverviewTab({
  path,
  detail,
  onMutated,
}: {
  path: string;
  detail: PullRequestDetail;
  onMutated: () => void;
}) {
  const [strategy, setStrategy] = useState<MergeStrategy>("merge");
  const [mergeMessage, setMergeMessage] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const canAct = detail.state === "open" || detail.state === "draft";

  async function doMerge() {
    if (!window.confirm(`PR #${detail.number} jetzt mergen (${strategy})?`))
      return;
    setBusy("merge");
    try {
      await invoke("pr_merge", {
        path,
        number: detail.number,
        strategy,
        message: mergeMessage.trim() ? mergeMessage.trim() : null,
      });
      onMutated();
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function submitReview(event: "APPROVE" | "REQUEST_CHANGES") {
    setBusy(event);
    try {
      await invoke("pr_submit_review", {
        path,
        number: detail.number,
        event,
        body: reviewBody.trim(),
      });
      setReviewBody("");
      onMutated();
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function doCheckout() {
    setBusy("checkout");
    try {
      const res = await invoke<{ branch: string }>("pr_checkout", {
        path,
        number: detail.number,
      });
      onMutated();
      window.alert(`Auf lokalen Branch '${res.branch}' ausgecheckt.`);
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-6 p-4">
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Beschreibung
          </h3>
          {detail.body_markdown.trim() ? (
            <div className="rounded border bg-muted/20 px-3 py-2 text-sm leading-relaxed [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:text-base [&_h3]:font-semibold [&_hr]:border-border [&_li]:ml-5 [&_li]:pl-1 [&_ol]:list-decimal [&_p+p]:mt-2 [&_p_code]:text-foreground [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border/70 [&_pre]:bg-muted/70 [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {detail.body_markdown}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="rounded border bg-muted/10 px-3 py-2 text-sm italic text-muted-foreground">
              Keine Beschreibung.
            </div>
          )}
        </section>

        {detail.labels.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Labels
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {detail.labels.map((l) => (
                <span
                  key={l}
                  className="rounded bg-muted px-2 py-0.5 text-xs"
                >
                  {l}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {detail.reviewers.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Reviewer
            </h3>
            <ul className="flex flex-wrap gap-1.5 text-xs">
              {detail.reviewers.map((r) => (
                <li
                  key={r.login}
                  className="rounded border bg-background px-2 py-0.5"
                >
                  {r.login}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Aktionen
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={doCheckout}
              disabled={busy !== null}
            >
              <Download className="mr-1 h-4 w-4" />
              {busy === "checkout" ? "Checke aus …" : "Lokal auschecken"}
            </Button>
          </div>

          {canAct ? (
            <>
              <div className="mt-2 flex flex-col gap-2 rounded border bg-background p-3">
                <span className="text-xs font-medium">Review</span>
                <Textarea
                  value={reviewBody}
                  onChange={(e) => setReviewBody(e.target.value)}
                  placeholder="Optionaler Kommentar …"
                  className="min-h-[70px] text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => submitReview("APPROVE")}
                    disabled={busy !== null}
                  >
                    <CheckCheck className="mr-1 h-4 w-4" />
                    {busy === "APPROVE" ? "…" : "Approve"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => submitReview("REQUEST_CHANGES")}
                    disabled={busy !== null}
                  >
                    <ThumbsDown className="mr-1 h-4 w-4" />
                    {busy === "REQUEST_CHANGES" ? "…" : "Request changes"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => submitReview("COMMENT" as "APPROVE")}
                    disabled={busy !== null || !reviewBody.trim()}
                  >
                    <MessageSquarePlus className="mr-1 h-4 w-4" />
                    Nur Kommentar
                  </Button>
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-2 rounded border bg-background p-3">
                <span className="text-xs font-medium">Merge</span>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-muted-foreground">
                    Strategie:
                  </label>
                  <select
                    value={strategy}
                    onChange={(e) =>
                      setStrategy(e.target.value as MergeStrategy)
                    }
                    className="rounded border bg-background px-2 py-1 text-xs"
                  >
                    <option value="merge">Merge commit</option>
                    <option value="squash">Squash</option>
                    <option value="rebase">
                      Rebase / Fast-forward
                    </option>
                  </select>
                </div>
                <Textarea
                  value={mergeMessage}
                  onChange={(e) => setMergeMessage(e.target.value)}
                  placeholder="Optionale Merge-Commit-Nachricht …"
                  className="min-h-[60px] text-sm"
                />
                <div>
                  <Button
                    size="sm"
                    onClick={doMerge}
                    disabled={busy !== null}
                  >
                    <GitMerge className="mr-1 h-4 w-4" />
                    {busy === "merge" ? "Merge läuft …" : "PR mergen"}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs italic text-muted-foreground">
              PR ist {detail.state}. Keine schreibenden Aktionen verfügbar.
            </p>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}
