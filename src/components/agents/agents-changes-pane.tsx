import { invoke } from "@tauri-apps/api/core";
import { FileDiff, Upload } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { SPRING_PANEL } from "@/@lib/ease";
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
      <header className="flex h-12 shrink-0 items-center gap-2.5 px-3.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] ring-1 ring-border/40">
          <FileDiff className="size-3.5 text-muted-foreground" />
        </span>
        <span className="text-[13px] font-medium tracking-tight">
          {t("agents.changes")}
        </span>
        <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground ring-1 ring-border/30">
          {t("agents.files", { count: entries.length })}
        </span>
        <span className="ml-auto">
          <AgentsDiffStat add={add} del={del} />
        </span>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5 p-2 pt-0.5">
          {entries.length === 0 ? (
            <m.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="px-2 py-10 text-center text-xs text-muted-foreground"
            >
              {t("agents.noChanges")}
            </m.p>
          ) : (
            entries.map((e) => <AgentsChangeRow key={e.path} entry={e} />)
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 p-2.5">
        <div className="space-y-2 rounded-2xl bg-background p-2 shadow-sm ring-1 ring-border/50 transition-shadow duration-300 focus-within:ring-border">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("agents.commitPlaceholder")}
            rows={3}
            className="resize-none border-0 bg-transparent px-1.5 py-1 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 flex-1 rounded-full transition-transform duration-200 active:scale-[0.98]"
              disabled={pending || !message.trim() || entries.length === 0}
              onClick={() => void commit()}
            >
              {t("agents.commit")}
            </Button>
            <AnimatePresence initial={false}>
              {ahead > 0 && (
                <m.div
                  initial={{ opacity: 0, width: 0, scale: 0.9 }}
                  animate={{ opacity: 1, width: "auto", scale: 1 }}
                  exit={{ opacity: 0, width: 0, scale: 0.9 }}
                  transition={SPRING_PANEL}
                  className="overflow-hidden"
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full transition-transform duration-200 active:scale-[0.98]"
                    disabled={pending}
                    onClick={() => void push()}
                  >
                    <Upload className="size-3.5" />
                    {t("agents.push")}
                    <span className="rounded-full bg-foreground/[0.08] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                      {ahead}
                    </span>
                  </Button>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </aside>
  );
}
