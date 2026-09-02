import { SpinIcon } from "@/components/motion/kit";
import { CommitAvatar } from "@/components/repo/commit/commit-avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toastError } from "@/lib/error-toast";
import { formatRelative } from "@/lib/format";
import { invoke } from "@tauri-apps/api/core";
import {
  CheckCircle2,
  FileCode2,
  Loader2,
  MessageSquare,
  Send,
  ThumbsDown,
} from "lucide-react";
import { m } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type PrComment = {
  id: string;
  author: string;
  author_avatar: string | null;
  created_at: string;
  body: string;
  kind: string;
  file_path: string | null;
  line: number | null;
};

type PrReview = {
  id: string;
  author: string;
  author_avatar: string | null;
  state: string;
  submitted_at: string;
  body: string;
};

type Conversation = {
  comments: PrComment[];
  reviews: PrReview[];
};

type Entry =
  | { kind: "comment"; at: string; data: PrComment }
  | { kind: "review"; at: string; data: PrReview };

export function PullRequestConversationTab({
  path,
  number,
  onCommented,
}: {
  path: string;
  number: number;
  onCommented: () => void;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const reviewLabel = useCallback(
    (state: string) => {
      const map: Record<string, string> = {
        APPROVED: t("pr.reviewApproved"),
        CHANGES_REQUESTED: t("pr.reviewRequestedChanges"),
        COMMENTED: t("pr.reviewCommented"),
        DISMISSED: t("pr.reviewDismissed"),
      };
      return map[state] ?? state;
    },
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoke<Conversation>("pr_conversation", { path, number });
      setData(res);
    } catch (e) {
      toastError(String(e));
      setData({ comments: [], reviews: [] });
    } finally {
      setLoading(false);
    }
  }, [path, number]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    try {
      await invoke("pr_add_comment", {
        path,
        number,
        body: body.trim(),
        inReplyTo: null,
        filePath: null,
        line: null,
      });
      setBody("");
      await load();
      onCommented();
    } catch (e) {
      toastError(String(e));
    } finally {
      setSending(false);
    }
  }

  const entries: Entry[] = [];
  if (data) {
    for (const c of data.comments) {
      entries.push({ kind: "comment", at: c.created_at, data: c });
    }
    for (const r of data.reviews) {
      entries.push({ kind: "review", at: r.submitted_at, data: r });
    }
    entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3.5 p-4">
          {loading && !data ? (
            <div className="flex items-center justify-center py-12">
              <SpinIcon icon={Loader2} className="h-6 w-6 text-primary" />
            </div>
          ) : entries.length === 0 ? (
            <m.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-12 text-center text-sm text-muted-foreground gap-2"
            >
              <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
              <span>{t("pr.conversationEmpty")}</span>
            </m.div>
          ) : (
            entries.map((e, i) => {
              if (e.kind === "review") {
                const isApproved = e.data.state === "APPROVED";
                const isChangesRequested = e.data.state === "CHANGES_REQUESTED";

                return (
                  <m.div
                    key={`r-${e.data.id}-${i}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={`rounded-xl border p-3.5 shadow-2xs backdrop-blur-xs ${
                      isApproved
                        ? "border-emerald-500/30 bg-emerald-500/8"
                        : isChangesRequested
                        ? "border-rose-500/30 bg-rose-500/8"
                        : "border-border/70 bg-muted/20"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2 text-xs">
                      <CommitAvatar
                        url={e.data.author_avatar}
                        name={e.data.author}
                        size="sm"
                      />
                      <span className="font-semibold text-foreground">{e.data.author}</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                          isApproved
                            ? "bg-emerald-500/15 text-emerald-400"
                            : isChangesRequested
                            ? "bg-rose-500/15 text-rose-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {isApproved && <CheckCircle2 className="h-3 w-3" />}
                        {isChangesRequested && <ThumbsDown className="h-3 w-3" />}
                        {reviewLabel(e.data.state)}
                      </span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground tabular-nums">
                        {formatRelative(e.data.submitted_at)}
                      </span>
                    </div>
                    {e.data.body.trim() ? (
                      <div className="mt-2 text-[13px] leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted/80 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.85em]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {e.data.body}
                        </ReactMarkdown>
                      </div>
                    ) : null}
                  </m.div>
                );
              }
              const c = e.data;
              return (
                <m.div
                  key={`c-${c.id}-${i}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="rounded-xl border border-border/70 bg-card/60 p-3.5 shadow-2xs backdrop-blur-xs"
                >
                  <div className="flex min-w-0 items-center gap-2 text-xs">
                    <CommitAvatar
                      url={c.author_avatar}
                      name={c.author}
                      size="sm"
                    />
                    <span className="font-semibold text-foreground">{c.author}</span>
                    {c.file_path ? (
                      <span
                        className="inline-flex items-center gap-1 truncate rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        title={`${c.file_path}${c.line ? `:${c.line}` : ""}`}
                      >
                        <FileCode2 className="h-2.5 w-2.5" />
                        <span className="truncate max-w-[200px]">{c.file_path}</span>
                        {c.line ? <span className="text-primary font-bold">:{c.line}</span> : ""}
                      </span>
                    ) : null}
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground tabular-nums">
                      {formatRelative(c.created_at)}
                    </span>
                  </div>
                  <div className="mt-2 text-[13px] leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted/80 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.85em]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {c.body}
                    </ReactMarkdown>
                  </div>
                </m.div>
              );
            })
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border/70 bg-muted/20 p-3.5 backdrop-blur-md">
        <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-background/80 p-2 shadow-xs focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={t("pr.conversationPlaceholder")}
            className="min-h-[70px] border-0 bg-transparent text-sm focus-visible:ring-0 shadow-none resize-none"
          />
          <div className="flex items-center justify-between pt-1 border-t border-border/40">
            <span className="text-[10px] text-muted-foreground/70 font-mono">
              Press ⌘+Enter to submit
            </span>
            <Button
              size="sm"
              onClick={send}
              disabled={sending || !body.trim()}
              className="h-7 text-[11px] rounded-lg shadow-xs"
            >
              {sending ? (
                <SpinIcon icon={Loader2} className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              {sending ? t("pr.conversationSending") : t("pr.conversationSubmit")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
