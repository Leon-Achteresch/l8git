import { invoke } from "@tauri-apps/api/core";
import { FileDiff, Upload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AgentsChangeRow } from "@/components/agents/agents-change-row";
import { AgentsDiffStat } from "@/components/agents/agents-diff-stat";
import {
  AGENTS_EMPTY_STATUS,
  agentsDiffTotals,
} from "@/components/agents/agents-types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useRepoStore } from "@/lib/repo-store";

export function AgentsChangesPane({ path }: { path: string | null }) {
  const { t } = useTranslation();
  const entries =
    useRepoStore((s) => (path ? s.status[path] : undefined)) ??
    AGENTS_EMPTY_STATUS;
  const ahead =
    useRepoStore((s) => (path ? s.upstreamSync[path]?.ahead : 0)) ?? 0;
  const stageFiles = useRepoStore((s) => s.stageFiles);
  const commitChanges = useRepoStore((s) => s.commitChanges);
  const reloadStatus = useRepoStore((s) => s.reloadStatus);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  if (!path) return null;

  const { add, del } = agentsDiffTotals(entries);

  const commit = async () => {
    const msg = message.trim();
    if (!msg || entries.length === 0) return;
    setPending(true);
    try {
      await stageFiles(
        path,
        entries.map((e) => e.path),
      );
      await commitChanges(path, msg);
      setMessage("");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setPending(false);
    }
  };

  const push = async () => {
    setPending(true);
    try {
      await invoke<string>("git_push", {
        path,
        setUpstream: false,
        forceMode: null,
        tagsMode: null,
        atomic: false,
        noVerify: false,
        dryRun: false,
      });
      await reloadStatus(path);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border/40 px-3.5">
        <FileDiff className="size-4 text-muted-foreground" />
        <span className="text-[13px] font-medium tracking-tight">
          {t("agents.changes")}
        </span>
        <span className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {t("agents.files", { count: entries.length })}
        </span>
        <span className="ml-auto">
          <AgentsDiffStat add={add} del={del} />
        </span>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5 p-2">
          {entries.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-muted-foreground">
              {t("agents.noChanges")}
            </p>
          ) : (
            entries.map((e) => <AgentsChangeRow key={e.path} entry={e} />)
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 space-y-2.5 border-t border-border/40 p-3">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("agents.commitPlaceholder")}
          rows={3}
          className="resize-none rounded-xl border-border/50 bg-muted/20 text-sm shadow-none focus-visible:bg-background"
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="flex-1 rounded-lg"
            disabled={pending || !message.trim() || entries.length === 0}
            onClick={() => void commit()}
          >
            {t("agents.commit")}
          </Button>
          {ahead > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-lg"
              disabled={pending}
              onClick={() => void push()}
            >
              <Upload className="size-3.5" />
              {t("agents.push")}
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                {ahead}
              </span>
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
