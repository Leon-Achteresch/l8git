import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toastError } from "@/lib/error-toast";
import { usePrCapabilities } from "@/lib/pr-provider-store";
import type { PullRequest } from "@/lib/repo-store";
import { useRepoStore } from "@/lib/repo-store";
import { Textarea } from "@/components/ui/textarea";
import { AiError } from "@/lib/ai/core";
import { generatePrDescription } from "@/lib/ai/explain-sources";
import { isAiConfigured } from "@/lib/ai-setup";
import {
  buildPrChain,
  chainBodyMarkdown,
  chainSummary,
  composePrBody,
  markChainFailure,
  submittableChainEntries,
  updateChainEntry,
  type PrChainEntry,
  type Stack,
} from "@/lib/stack";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  LoaderCircle,
  MinusCircle,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const EMPTY_PRS: PullRequest[] = [];

function StatusIcon({ status }: { status: PrChainEntry["status"] }) {
  if (status === "created" || status === "existing") {
    return <Check className="h-3.5 w-3.5 shrink-0 text-git-added" aria-hidden />;
  }
  if (status === "failed") {
    return (
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-git-removed" aria-hidden />
    );
  }
  if (status === "skipped") {
    return (
      <MinusCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
    );
  }
  return <span className="h-3.5 w-3.5 shrink-0" aria-hidden />;
}

export function StackPrChainDialog({
  open,
  onClose,
  path,
  stack,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  stack: Stack | null;
}) {
  const { t } = useTranslation();
  const loadPRs = useRepoStore((s) => s.loadPRs);
  const caps = usePrCapabilities(path);
  const canDraft = caps ? caps.can_draft : true;

  const [entries, setEntries] = useState<PrChainEntry[]>([]);
  const [draft, setDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [aiBranch, setAiBranch] = useState<string | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);

  const stackRef = useRef<Stack | null>(stack);
  stackRef.current = stack;
  const stackRoot = stack?.root ?? "";

  useEffect(() => {
    if (!open || !stackRoot) return;
    const build = () => {
      const current = stackRef.current;
      if (!current) return;
      setEntries(
        buildPrChain(current, useRepoStore.getState().prs[path] ?? EMPTY_PRS),
      );
    };
    setDraft(false);
    setBusy(false);
    setDone(false);
    build();
    let cancelled = false;
    void loadPRs(path).then(() => {
      if (!cancelled) build();
    });
    return () => {
      cancelled = true;
    };
  }, [open, path, stackRoot, loadPRs]);

  useEffect(() => () => aiAbortRef.current?.abort(), []);

  function dismiss() {
    if (busy) return;
    aiAbortRef.current?.abort();
    onClose();
  }

  async function runAiBody(entry: PrChainEntry) {
    if (aiBranch) return;
    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    setAiBranch(entry.branch);
    try {
      const result = await generatePrDescription(
        { repoPath: path, head: entry.branch, base: entry.parent },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setEntries((cur) =>
        updateChainEntry(cur, entry.branch, { body: result.body }),
      );
    } catch (cause) {
      if (cause instanceof AiError && cause.kind === "aborted") return;
      toastError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (aiAbortRef.current === controller) aiAbortRef.current = null;
      setAiBranch((cur) => (cur === entry.branch ? null : cur));
    }
  }

  async function submit() {
    if (!stack) return;
    const pending = submittableChainEntries(entries);
    if (pending.length === 0) {
      toastError(t("stack.chainNothingToDo"));
      return;
    }
    setBusy(true);
    let current = entries.map((e) =>
      e.status === "skipped" ? { ...e, status: "planned" as const, error: null } : e,
    );
    setEntries(current);
    try {
      for (const entry of current) {
        if (entry.status !== "planned" && entry.status !== "failed") continue;
        const title = entry.title.trim();
        if (!title) {
          current = markChainFailure(current, entry.branch, t("stack.chainTitleRequired"));
          setEntries(current);
          break;
        }
        try {
          const chain = chainBodyMarkdown(current, entry.branch, {
            heading: t("stack.chainBodyHeading"),
            currentMarker: t("stack.chainBodyCurrent"),
          });
          const pr = await invoke<PullRequest>("pr_create", {
            path,
            title,
            body: composePrBody(entry.body, chain),
            head: entry.branch,
            base: entry.parent,
            draft: canDraft && draft,
          });
          current = updateChainEntry(current, entry.branch, {
            status: "created",
            prNumber: pr.number,
            prUrl: pr.html_url,
            error: null,
          });
          setEntries(current);
        } catch (err) {
          current = markChainFailure(current, entry.branch, String(err));
          setEntries(current);
          break;
        }
      }
      const summary = chainSummary(current);
      if (summary.failed > 0) {
        toastError(
          t("stack.chainFailedToast", {
            created: summary.created,
            skipped: summary.skipped,
          }),
        );
      } else if (summary.created > 0) {
        toast.success(t("stack.chainDoneToast", { count: summary.created }));
      }
      setDone(true);
      await loadPRs(path);
    } finally {
      setBusy(false);
    }
  }

  if (!open || !stack) return null;

  const summary = chainSummary(entries);
  const pendingCount = summary.planned + summary.failed;
  const aiReady = isAiConfigured();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("stack.chainDialogAria")}
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={dismiss}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-heading text-base font-medium">{t("stack.chainTitle")}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            disabled={busy}
            aria-label={t("stack.closeAria")}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <p className="mb-2 text-xs text-muted-foreground">
          {t("stack.chainDesc", { root: stack.root })}
        </p>

        {entries.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            {t("stack.chainEmpty")}
          </p>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <ul className="space-y-1.5 pr-2">
              {entries.map((entry) => (
                <li
                  key={entry.branch}
                  className={cn(
                    "rounded-md border border-border/70 px-2 py-1.5",
                    entry.status === "failed" && "border-git-removed/50 bg-git-removed/5",
                    entry.status === "skipped" && "opacity-60",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <StatusIcon status={entry.status} />
                    <Badge variant="outline" className="shrink-0 tabular-nums">
                      {entry.level}
                    </Badge>
                    <span
                      className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground"
                      title={`${entry.branch} → ${entry.parent}`}
                    >
                      {entry.branch}
                      <span className="text-muted-foreground/60"> → {entry.parent}</span>
                    </span>
                    {entry.prNumber != null ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("stack.chainOpenPrAria", { number: entry.prNumber })}
                        onClick={() => {
                          if (entry.prUrl) void openUrl(entry.prUrl);
                        }}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    ) : null}
                  </div>
                  <Input
                    inputSize="sm"
                    className="mt-1"
                    value={entry.title}
                    disabled={busy || entry.status === "existing" || entry.status === "created"}
                    aria-label={t("stack.chainTitleAria", { branch: entry.branch })}
                    onChange={(e) =>
                      setEntries((cur) =>
                        updateChainEntry(cur, entry.branch, { title: e.target.value }),
                      )
                    }
                  />
                  {entry.status === "planned" || entry.status === "failed" ? (
                    <div className="mt-1 flex items-start gap-1.5">
                      <Textarea
                        rows={2}
                        className="min-h-0 flex-1 text-[11px]"
                        value={entry.body}
                        disabled={busy}
                        placeholder={t("stack.chainBodyPlaceholder")}
                        aria-label={t("stack.chainBodyAria", { branch: entry.branch })}
                        onChange={(e) =>
                          setEntries((cur) =>
                            updateChainEntry(cur, entry.branch, { body: e.target.value }),
                          )
                        }
                      />
                      {aiReady ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={busy || aiBranch !== null}
                          aria-label={t("stack.chainBodyAiAria", { branch: entry.branch })}
                          title={t("stack.chainBodyAi")}
                          onClick={() => void runAiBody(entry)}
                        >
                          {aiBranch === entry.branch ? (
                            <LoaderCircle className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3 text-primary" />
                          )}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {entry.status === "existing" ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {t("stack.chainExisting", { number: entry.prNumber ?? 0 })}
                    </p>
                  ) : null}
                  {entry.status === "skipped" ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {t("stack.chainSkipped")}
                    </p>
                  ) : null}
                  {entry.error ? (
                    <p className="mt-1 text-[10px] text-git-removed">{entry.error}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          {canDraft ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={draft}
                disabled={busy}
                onCheckedChange={(v) => setDraft(v === true)}
              />
              {t("stack.chainDraft")}
            </label>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={busy}>
              {done ? t("stack.close") : t("stack.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || pendingCount === 0}
              onClick={() => void submit()}
            >
              {busy
                ? t("stack.chainBusy")
                : t("stack.chainSubmit", { count: pendingCount })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
