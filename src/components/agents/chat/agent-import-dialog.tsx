import {
  Bot,
  CheckCircle2,
  ChevronRight,
  FileCog,
  History,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import type {
  AgentExternalConfigImportHistory,
  AgentExternalConfigImportTypeResult,
  AgentExternalConfigItemType,
  AgentExternalConfigMigrationItem,
} from "@/lib/agents/types";
import { cn } from "@/lib/utils";
import { SpinIcon } from "@/components/motion/kit";
import { CircleCheckBig as CheckCircle2Data, TriangleAlert as TriangleAlertData } from "lucide";
import { MorphIcon } from "@/components/ui/morph-icon";

const ITEM_LABELS: Record<AgentExternalConfigItemType, string> = {
  AGENTS_MD: "Instructions",
  CONFIG: "Settings",
  SKILLS: "Skills",
  PLUGINS: "Plugins",
  MCP_SERVER_CONFIG: "MCP servers",
  SUBAGENTS: "Subagents",
  HOOKS: "Hooks",
  COMMANDS: "Slash commands",
  MEMORY: "Memories",
  SESSIONS: "Recent chats",
};

function itemKey(item: AgentExternalConfigMigrationItem): string {
  return `${item.itemType}:${item.cwd ?? "home"}:${item.description}`;
}

function itemNames(item: AgentExternalConfigMigrationItem): string[] {
  const details = item.details;
  if (!details) return [];
  if (item.itemType === "PLUGINS") return details.plugins.flatMap((plugin) => plugin.pluginNames);
  if (item.itemType === "SKILLS") return details.skills.map((entry) => entry.name);
  if (item.itemType === "SESSIONS") {
    return details.sessions.map((entry) => entry.title || entry.cwd.split(/[\\/]/u).pop() || entry.cwd);
  }
  if (item.itemType === "MCP_SERVER_CONFIG") return details.mcpServers.map((entry) => entry.name);
  if (item.itemType === "HOOKS") return details.hooks.map((entry) => entry.name);
  if (item.itemType === "SUBAGENTS") return details.subagents.map((entry) => entry.name);
  if (item.itemType === "COMMANDS") return details.commands.map((entry) => entry.name);
  if (item.itemType === "MEMORY") return details.memory ?? [];
  return [];
}

function itemCount(item: AgentExternalConfigMigrationItem): number {
  return Math.max(1, itemNames(item).length);
}

function resultTotals(results: AgentExternalConfigImportTypeResult[]): {
  successes: number;
  failures: number;
} {
  return results.reduce(
    (totals, result) => ({
      successes: totals.successes + result.successes.length,
      failures: totals.failures + result.failures.length,
    }),
    { successes: 0, failures: 0 },
  );
}

export function AgentImportDialog({
  open,
  onOpenChange,
  path,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  path: string;
}) {
  const detect = useAgentChatStore((state) => state.detectExternalAgentConfig);
  const listHistories = useAgentChatStore((state) => state.listExternalAgentConfigImportHistories);
  const importItems = useAgentChatStore((state) => state.importExternalAgentConfig);
  const [items, setItems] = useState<AgentExternalConfigMigrationItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [histories, setHistories] = useState<AgentExternalConfigImportHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<AgentExternalConfigImportTypeResult[]>([]);
  const [completed, setCompleted] = useState<AgentExternalConfigImportTypeResult[] | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCompleted(null);
    setProgress([]);
    try {
      const [detected, previous] = await Promise.all([
        detect(path),
        listHistories().catch(() => []),
      ]);
      setItems(detected);
      setSelectedKeys(new Set(detected.map(itemKey)));
      setHistories([...previous].sort((a, b) => b.completedAtMs - a.completedAtMs));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [detect, listHistories, path]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedKeys.has(itemKey(item))),
    [items, selectedKeys],
  );
  const selectedCount = selectedItems.reduce((count, item) => count + itemCount(item), 0);
  const totals = completed ? resultTotals(completed) : null;
  const lastImport = histories[0];

  const toggle = (key: string, checked: boolean) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const runImport = async () => {
    if (!selectedItems.length) return;
    setImporting(true);
    setError(null);
    setProgress([]);
    setCompleted(null);
    try {
      const results = await importItems(selectedItems, (next) => {
        setProgress((current) => {
          const byType = new Map(current.map((result) => [result.itemType, result]));
          for (const result of next) byType.set(result.itemType, result);
          return [...byType.values()];
        });
      });
      setCompleted(results);
      const summary = resultTotals(results);
      if (summary.failures) toast.warning(`Imported ${summary.successes} items with ${summary.failures} failures`);
      else toast.success(`Imported ${summary.successes} items from Claude Code`);
      const previous = await listHistories().catch(() => []);
      setHistories([...previous].sort((a, b) => b.completedAtMs - a.completedAtMs));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && importing) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[min(760px,calc(100vh-2rem))] gap-3 p-0 sm:max-w-2xl" showCloseButton={!importing}>
        <DialogHeader className="px-5 pt-5">
          <div className="flex items-center gap-3 pr-8">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-foreground/[0.06] ring-1 ring-border/50">
              <Bot className="size-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle>Import from Claude Code</DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-5">
                Preview and copy supported local setup. Existing Codex files are kept unchanged.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 px-5">
          <div className="min-w-0 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">Home + current repository</span>
            <span className="mx-1.5">·</span>
            Up to 50 chats from 30 days
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 rounded-lg px-2 text-[11px]"
            onClick={() => void refresh()}
            disabled={loading || importing}
          >
            <SpinIcon icon={RefreshCw} active={loading} className="size-3" />
            Scan again
          </Button>
        </div>

        <ScrollArea className="min-h-0 max-h-[440px] border-y border-border/45">
          <div className="space-y-2 p-4">
            {loading ? (
              <div className="flex min-h-48 items-center justify-center text-xs text-muted-foreground">
                <SpinIcon icon={LoaderCircle} className="mr-2 size-4" />
                Scanning local Claude Code setup…
              </div>
            ) : error && !items.length ? (
              <div className="min-h-40 rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-xs text-destructive">
                <div className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              </div>
            ) : !items.length ? (
              <div className="flex min-h-48 flex-col items-center justify-center text-center">
                <CheckCircle2 className="size-5 text-emerald-500" />
                <p className="mt-2 text-sm font-medium">Nothing new to import</p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                  Codex found no supported Claude Code setup that still needs migration.
                </p>
              </div>
            ) : (
              items.map((item, index) => {
                const key = itemKey(item);
                const names = itemNames(item);
                const selected = selectedKeys.has(key);
                return (
                  <label
                    key={key}
                    htmlFor={`agent-import-${index}`}
                    className={cn(
                      "group flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                      selected
                        ? "border-border/75 bg-card/80"
                        : "border-transparent bg-muted/35 text-muted-foreground",
                    )}
                  >
                    <Checkbox
                      id={`agent-import-${index}`}
                      checked={selected}
                      onCheckedChange={(checked) => toggle(key, checked === true)}
                      disabled={importing}
                      className="mt-0.5"
                    />
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-foreground/[0.055] ring-1 ring-border/35">
                      {item.itemType === "SESSIONS" ? <History className="size-3.5" />
                        : item.itemType === "SKILLS" || item.itemType === "PLUGINS" ? <Sparkles className="size-3.5" />
                          : <FileCog className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{ITEM_LABELS[item.itemType]}</span>
                        <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">{itemCount(item)}</Badge>
                        <Badge variant="outline" className="ml-auto h-4 max-w-48 px-1.5 text-[9px] font-normal">
                          <span className="truncate">{item.cwd ? item.cwd.split(/[\\/]/u).pop() : "User setup"}</span>
                        </Badge>
                      </span>
                      <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{item.description}</span>
                      {names.length ? (
                        <span className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground/80">
                          <ChevronRight className="size-3 shrink-0" />
                          <span className="truncate">
                            {names.slice(0, 4).join(", ")}{names.length > 4 ? `, +${names.length - 4} more` : ""}
                          </span>
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })
            )}

            {importing ? (
              <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-3 text-xs">
                <div className="flex items-center gap-2 font-medium">
                  <SpinIcon icon={LoaderCircle} className="size-3.5" />
                  Importing {selectedCount} items…
                </div>
                <p className="mt-1 pl-5 text-[10px] text-muted-foreground">
                  {progress.length ? `${progress.length} categories completed` : "Preparing local migration"}
                </p>
              </div>
            ) : null}

            {completed && totals ? (
              <div className={cn(
                "rounded-xl border p-3 text-xs",
                totals.failures ? "border-amber-500/30 bg-amber-500/[0.07]" : "border-emerald-500/25 bg-emerald-500/[0.06]",
              )}>
                <div className="flex items-center gap-2 font-medium">
                  <MorphIcon icon={totals.failures ? TriangleAlertData : CheckCircle2Data} className={cn("size-3.5", totals.failures ? "text-amber-600" : "text-emerald-600")} />
                  {totals.successes} imported · {totals.failures} failed
                </div>
                {completed.flatMap((result) => result.failures).map((failure, index) => (
                  <p key={`${failure.itemType}:${index}`} className="mt-1.5 pl-5 text-[10px] leading-4 text-muted-foreground">
                    {ITEM_LABELS[failure.itemType]}: {failure.message}
                  </p>
                ))}
              </div>
            ) : null}

            {error && items.length ? (
              <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            ) : null}
          </div>
        </ScrollArea>

        {lastImport ? (
          <p className="px-5 text-[10px] text-muted-foreground">
            Last import {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(lastImport.completedAtMs)}
            {` · ${lastImport.successes.length} imported`}
            {lastImport.failures.length ? ` · ${lastImport.failures.length} failed` : ""}
          </p>
        ) : null}

        <DialogFooter className="mx-0 mb-0 px-5 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            {completed ? "Done" : "Cancel"}
          </Button>
          {!completed ? (
            <Button
              type="button"
              onClick={() => void runImport()}
              disabled={loading || importing || !selectedItems.length}
            >
              {importing ? <SpinIcon icon={LoaderCircle} className="size-3.5" /> : null}
              Import {selectedCount || "selected"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
