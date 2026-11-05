import { TemplateInsertMenu } from "../github/comment-templates";
import { CommitAvatar } from "@/components/repo/commit/commit-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toastError } from "@/lib/error-toast";
import { formatRelative } from "@/lib/format";
import type { ReviewDraftComment } from "@/lib/pr-review-drafts";
import {
  applySuggestionToContent,
  buildSuggestionBody,
  splitCommentBody,
} from "@/lib/pr-suggestions";
import type { PrCommentThread } from "@/lib/pr-threads";
import { useRepoStore } from "@/lib/repo-store";
import { invoke } from "@tauri-apps/api/core";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Loader2,
  MessageSquare,
  Pencil,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { SpinIcon } from "@/components/motion/kit";
import { PrT3Menu } from "./pr-t3-menu";

function SuggestionPreview({
  repoPath,
  filePath,
  line,
  startLine,
  lines,
  applyEnabled,
  applyDisabledHint,
}: {
  repoPath: string;
  filePath: string;
  line: number;
  startLine?: number;
  lines: string[];
  applyEnabled: boolean;
  applyDisabledHint: string;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  async function apply() {
    setBusy(true);
    try {
      const content = await invoke<string>("repo_read_file", {
        path: repoPath,
        file: filePath,
      });
      const next = applySuggestionToContent(content, line, lines, startLine);
      if (next === null) {
        toastError(t("prReview.suggestionOutOfRange", { file: filePath, line }));
        return;
      }
      await invoke("repo_write_file", {
        path: repoPath,
        file: filePath,
        content: next,
      });
      await useRepoStore.getState().reloadStatus(repoPath);
      toast.success(t("prReview.suggestionApplied", { file: filePath, line }));
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5 overflow-hidden rounded border border-git-added/40">
      <div className="flex items-center gap-1.5 border-b border-git-added/30 bg-git-added/10 px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-wide text-git-added">
        <Lightbulb className="h-3 w-3" />
        {t("prReview.suggestionTitle")}
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="ml-auto h-5 text-[0.625rem]"
          disabled={!applyEnabled || busy}
          title={applyEnabled ? undefined : applyDisabledHint}
          onClick={() => void apply()}
        >
          {busy ? <SpinIcon icon={Loader2} className="mr-1 h-3 w-3" /> : null}
          {t("prReview.suggestionApply")}
        </Button>
      </div>
      {lines.length === 0 ? (
        <div className="px-2 py-1 font-mono text-[0.6875rem] italic text-muted-foreground">
          {t("prReview.suggestionDeletesLine")}
        </div>
      ) : (
        <div className="bg-git-added-subtle/40">
          {lines.map((text, i) => (
            <div
              key={i}
              className="whitespace-pre px-2 py-0.5 font-mono text-[0.6875rem] text-git-added"
            >
              {text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CommentBody({
  body,
  repoPath,
  filePath,
  line,
  startLine,
  applyEnabled,
  applyDisabledHint,
}: {
  body: string;
  repoPath: string;
  filePath: string;
  line: number;
  startLine?: number;
  applyEnabled: boolean;
  applyDisabledHint: string;
}) {
  const segments = splitCommentBody(body);
  return (
    <>
      {segments.map((segment, i) =>
        segment.kind === "text" ? (
          <div key={i} className="mt-1 whitespace-pre-wrap text-[0.75rem] leading-relaxed">
            {segment.text}
          </div>
        ) : (
          <SuggestionPreview
            key={i}
            repoPath={repoPath}
            filePath={filePath}
            line={line}
            startLine={startLine}
            lines={segment.lines}
            applyEnabled={applyEnabled}
            applyDisabledHint={applyDisabledHint}
          />
        ),
      )}
    </>
  );
}

export function InlineCommentComposer({
  lineText,
  initialBody = "",
  busy = false,
  submitLabel,
  onSubmit,
  onCancel,
  onBodyChange,
}: {
  lineText: string;
  initialBody?: string;
  busy?: boolean;
  submitLabel: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
  /** Lets a parent keep the text when the composer moves (range extension remounts it). */
  onBodyChange?: (body: string) => void;
}) {
  const { t } = useTranslation();
  const [body, setBody] = useState(initialBody);
  useEffect(() => onBodyChange?.(body), [body]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded border border-primary/30 bg-primary/5 p-2">
      <Textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("prReview.commentPlaceholder")}
        className="min-h-[64px] text-[0.75rem]"
      />
      <div className="mt-1.5 flex items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="h-6 text-[0.625rem]"
          title={t("prReview.suggestionModeHint")}
          onClick={() => setBody((prev) => buildSuggestionBody(lineText, prev))}
        >
          <Lightbulb className="mr-1 h-3 w-3" />
          {t("prReview.suggestionMode")}
        </Button>
        <TemplateInsertMenu current={body} onInsert={(tpl) => setBody((prev) => (prev.trim() ? `${prev}\n\n${tpl}` : tpl))} />
        <span className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="h-6 text-[0.625rem]"
          onClick={onCancel}
        >
          {t("prReview.cancel")}
        </Button>
        <Button
          type="button"
          size="xs"
          className="h-6 text-[0.625rem]"
          disabled={busy || !body.trim()}
          onClick={() => onSubmit(body.trim())}
        >
          {busy ? <SpinIcon icon={Loader2} className="mr-1 h-3 w-3" /> : null}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

export function InlineDraftCard({
  draft,
  repoPath,
  applyEnabled,
  applyDisabledHint,
  onChange,
  onRemove,
}: {
  draft: ReviewDraftComment;
  repoPath: string;
  applyEnabled: boolean;
  applyDisabledHint: string;
  onChange: (body: string) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <InlineCommentComposer
        lineText=""
        initialBody={draft.body}
        submitLabel={t("prReview.draftSave")}
        onSubmit={(body) => {
          onChange(body);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="rounded border border-dashed border-primary/40 bg-primary/5 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <Badge variant="info">{t("prReview.draftBadge")}</Badge>
        <span className="font-mono text-[0.625rem] text-muted-foreground">
          {rangeLabel(t, draft) ?? t("prReview.lineLabel", { line: draft.line })}
        </span>
        <span className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          title={t("prReview.draftEdit")}
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          title={t("prReview.draftRemove")}
          onClick={onRemove}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <CommentBody
        body={draft.body}
        repoPath={repoPath}
        filePath={draft.filePath}
        line={draft.line}
        startLine={localStartLine(draft)}
        applyEnabled={applyEnabled && draft.side !== "LEFT" && (draft.startSide ?? "RIGHT") !== "LEFT"}
        applyDisabledHint={draft.side === "LEFT" || draft.startSide === "LEFT" ? t("prRanges.applyOldSide") : applyDisabledHint}
      />
    </div>
  );
}

export type ThreadRange = { line: number; side?: "LEFT" | "RIGHT"; startLine?: number; startSide?: "LEFT" | "RIGHT"; outdated?: boolean };

/** Same-side new-file range start for local apply; mixed or old-side ranges are never applied locally. */
function localStartLine(r: { line: number; side?: "LEFT" | "RIGHT"; startLine?: number; startSide?: "LEFT" | "RIGHT" }): number | undefined {
  return r.startLine !== undefined && r.startLine < r.line && (r.side ?? "RIGHT") === "RIGHT" && (r.startSide ?? "RIGHT") === "RIGHT" ? r.startLine : undefined;
}

function rangeLabel(t: TFunction, r: { line: number; side?: "LEFT" | "RIGHT"; startLine?: number; startSide?: "LEFT" | "RIGHT" }): string | null {
  const sign = (side?: "LEFT" | "RIGHT") => (side === "LEFT" ? "-" : "+");
  if (r.startLine === undefined) return r.side === "LEFT" ? t("prRanges.oldLine", { line: r.line }) : null;
  return t("prRanges.lines", { start: `${sign(r.startSide ?? r.side)}${r.startLine}`, end: `${sign(r.side)}${r.line}` });
}

export type ThreadResolveState = {
  nodeId: string;
  resolved: boolean;
};

export function InlineThreadCard({
  thread,
  repoPath,
  prNumber,
  canReply,
  applyEnabled,
  applyDisabledHint,
  resolveState,
  range,
  onReplied,
  onResolved,
}: {
  thread: PrCommentThread;
  /** Provider anchor metadata (GitHub review threads); absent means single new-side line as before. */
  range?: ThreadRange;
  repoPath: string;
  prNumber: number;
  canReply: boolean;
  applyEnabled: boolean;
  applyDisabledHint: string;
  resolveState?: ThreadResolveState;
  onReplied: () => void;
  onResolved?: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [replying, setReplying] = useState(false);
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);

  const first = thread.comments[0];

  async function toggleResolved() {
    if (!resolveState) return;
    setResolving(true);
    try {
      await invoke("pr_resolve_thread", {
        path: repoPath,
        threadId: resolveState.nodeId,
        resolved: !resolveState.resolved,
      });
      onResolved?.();
    } catch (e) {
      toastError(String(e));
    } finally {
      setResolving(false);
    }
  }

  async function sendReply(body: string) {
    setSending(true);
    try {
      await invoke("pr_add_comment", {
        path: repoPath,
        number: prNumber,
        body,
        inReplyTo: thread.replyTo,
        filePath: thread.filePath,
        line: thread.line,
      });
      setReplying(false);
      onReplied();
    } catch (e) {
      toastError(String(e));
    } finally {
      setSending(false);
    }
  }

  const isResolved = resolveState?.resolved ?? false;

  return (
    <div className={`rounded-xl bg-card ring-1 ring-border/50 ${isResolved ? "opacity-70" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <MessageSquare className="h-3 w-3 shrink-0 text-primary" />
        <span className="text-[0.6875rem] font-medium">{first.author}</span>
        {range && (rangeLabel(t, range) || range.outdated) && (
          <span className="shrink-0 font-mono text-[0.625rem] text-muted-foreground">
            {range.outdated ? t("prRanges.outdated") : rangeLabel(t, range)}
          </span>
        )}
        {isResolved && (
          <Badge variant="success">{t("prReview.threadResolved")}</Badge>
        )}
        {!open && (
          <span className="min-w-0 flex-1 truncate text-[0.6875rem] text-muted-foreground">
            {first.body.split("\n")[0]}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1 text-[0.625rem] text-muted-foreground">
          {canReply && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-6 text-[0.625rem]"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(true);
                setReplying(true);
              }}
            >
              {t("prReview.reply")}
            </Button>
          )}
          <PrT3Menu
            comment={{
              author: first.author,
              // The whole thread, so the agent sees follow-ups too.
              body: thread.comments.map((c) => `${c.author}: ${c.body}`).join("\n\n"),
              path: thread.filePath,
              line: thread.line,
            }}
          />
          {t("prReview.threadCount", { count: thread.comments.length })}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-1.5 border-t px-2 py-1.5">
          {thread.comments.map((comment) => (
            <div key={comment.id}>
              <div className="flex min-w-0 items-center gap-1.5 text-[0.6875rem]">
                <CommitAvatar
                  url={comment.author_avatar}
                  name={comment.author}
                  size="sm"
                />
                <span className="font-medium">{comment.author}</span>
                <span className="ml-auto text-muted-foreground tabular-nums">
                  {formatRelative(comment.created_at)}
                </span>
              </div>
              <CommentBody
                body={comment.body}
                repoPath={repoPath}
                filePath={thread.filePath}
                line={thread.line}
                startLine={range ? localStartLine(range) : undefined}
                applyEnabled={applyEnabled && !(range && (range.outdated || range.side === "LEFT" || range.startSide === "LEFT"))}
                applyDisabledHint={range?.outdated ? t("prRanges.applyOutdated") : range && (range.side === "LEFT" || range.startSide === "LEFT") ? t("prRanges.applyOldSide") : applyDisabledHint}
              />
            </div>
          ))}

          {replying ? (
            <InlineCommentComposer
              lineText=""
              busy={sending}
              submitLabel={t("prReview.replySubmit")}
              onSubmit={(body) => void sendReply(body)}
              onCancel={() => setReplying(false)}
            />
          ) : (
            <div className="flex items-center gap-1.5">
              {resolveState && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="h-6 text-[0.625rem]"
                  disabled={resolving}
                  onClick={() => void toggleResolved()}
                >
                  {resolving ? (
                    <SpinIcon icon={Loader2} className="mr-1 h-3 w-3" />
                  ) : (
                    <Check className="mr-1 h-3 w-3" />
                  )}
                  {isResolved
                    ? t("prReview.threadUnresolve")
                    : t("prReview.threadResolve")}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
