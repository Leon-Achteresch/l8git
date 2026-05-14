import { CommitAvatar } from "@/components/repo/commit/commit-avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toastError } from "@/lib/error-toast";
import { formatRelative } from "@/lib/format";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

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
      await invoke("pr_add_comment", { path, number, body: body.trim() });
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
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-4">
          {loading && !data ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
            </div>
          ) : entries.length === 0 ? (
            <div className="py-8 text-center text-sm italic text-muted-foreground">
              {t("pr.conversationEmpty")}
            </div>
          ) : (
            entries.map((e, i) => {
              if (e.kind === "review") {
                return (
                  <div
                    key={`r-${e.data.id}-${i}`}
                    className="rounded border border-primary/20 bg-primary/5 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2 text-xs">
                      <CommitAvatar
                        url={e.data.author_avatar}
                        name={e.data.author}
                        size="sm"
                      />
                      <span className="font-medium">{e.data.author}</span>
                      <span className="text-muted-foreground">
                        {reviewLabel(e.data.state)}
                      </span>
                      <span className="ml-auto text-muted-foreground tabular-nums">
                        {formatRelative(e.data.submitted_at)}
                      </span>
                    </div>
                    {e.data.body.trim() ? (
                      <div className="mt-1.5 whitespace-pre-wrap text-sm">
                        {e.data.body}
                      </div>
                    ) : null}
                  </div>
                );
              }
              const c = e.data;
              return (
                <div
                  key={`c-${c.id}-${i}`}
                  className="rounded border bg-background px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2 text-xs">
                    <CommitAvatar
                      url={c.author_avatar}
                      name={c.author}
                      size="sm"
                    />
                    <span className="font-medium">{c.author}</span>
                    {c.file_path ? (
                      <span
                        className="truncate font-mono text-[10px] text-muted-foreground"
                        title={`${c.file_path}${c.line ? `:${c.line}` : ""}`}
                      >
                        {c.file_path}
                        {c.line ? `:${c.line}` : ""}
                      </span>
                    ) : null}
                    <span className="ml-auto text-muted-foreground tabular-nums">
                      {formatRelative(c.created_at)}
                    </span>
                  </div>
                  <div className="mt-1.5 whitespace-pre-wrap text-sm">
                    {c.body}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
      <div className="border-t bg-muted/10 p-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("pr.conversationPlaceholder")}
          className="min-h-[70px] text-sm"
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            onClick={send}
            disabled={sending || !body.trim()}
          >
            {sending ? t("pr.conversationSending") : t("pr.conversationSubmit")}
          </Button>
        </div>
      </div>
    </div>
  );
}
