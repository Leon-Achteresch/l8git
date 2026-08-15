import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UndoConfirmDialog } from "@/components/repo/undo/undo-confirm-dialog";
import { useRepoToolsStore, type ToolAction } from "@/lib/repo-tools-store";
import { useTerminalStore } from "@/lib/terminal-store";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { History, Play, ScrollText, Undo2, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function ToolsPanel({ path }: { path: string }) {
  const { t } = useTranslation();
  const tools = useRepoToolsStore((s) => s.toolsByPath[path]);
  const loadTools = useRepoToolsStore((s) => s.loadTools);
  const openTab = useTerminalStore((s) => s.openTab);
  const openReflogView = useUiStore((s) => s.openReflogView);
  const openCommandLog = useUiStore((s) => s.openCommandLog);
  const [pendingConfirm, setPendingConfirm] = useState<ToolAction | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);

  useEffect(() => {
    void loadTools(path);
  }, [path, loadTools]);

  // Actions run only on explicit click; the command is shown so the user sees what executes.
  const runAction = (action: ToolAction) => {
    openTab(path, action.label, action.run);
  };

  const onRun = (action: ToolAction) => {
    if (action.confirm) setPendingConfirm(action);
    else runAction(action);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border/50 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Wrench className="size-4" />
          {t("tools.title")}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("tools.subtitle")}
        </p>
      </div>

      <div className="shrink-0 border-b border-border/50 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t("tools.gitSection")}
        </h3>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start gap-2"
            onClick={() => openReflogView(path)}
          >
            <History className="size-3.5" />
            {t("reflog.openTitle")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start gap-2"
            onClick={() => openCommandLog()}
          >
            <ScrollText className="size-3.5" />
            {t("cmdLog.openTitle")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start gap-2"
            onClick={() => setUndoOpen(true)}
          >
            <Undo2 className="size-3.5" />
            {t("undo.buttonLabel")}
          </Button>
        </div>
      </div>

      {tools && tools.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
          <p className="text-sm text-muted-foreground">{t("tools.empty")}</p>
          <p className="text-xs text-muted-foreground/70">
            {t("tools.emptyHint")}
          </p>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-3 p-4">
            {(tools ?? []).map((tool, ti) => (
              <div
                key={`${tool.name}-${ti}`}
                className={cn(
                  "rounded-lg border border-border/60 bg-card/40",
                  !tool.available && "opacity-60",
                )}
              >
                <div className="flex items-baseline justify-between gap-2 border-b border-border/40 px-3 py-2">
                  <span className="text-sm font-medium text-foreground">
                    {tool.name}
                  </span>
                  {!tool.available && tool.requires && (
                    <span className="text-[11px] text-git-modified">
                      {t("tools.unavailable", { requires: tool.requires })}
                    </span>
                  )}
                </div>
                <div className="flex flex-col divide-y divide-border/30">
                  {tool.actions.map((action, ai) => (
                    <div
                      key={`${action.label}-${ai}`}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm text-foreground">
                          {action.label}
                        </div>
                        <code className="block truncate font-mono text-[11px] text-muted-foreground">
                          {action.run}
                        </code>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0 gap-1.5"
                        disabled={!tool.available}
                        onClick={() => onRun(action)}
                      >
                        <Play className="size-3.5" />
                        {t("tools.run")}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      <UndoConfirmDialog
        open={undoOpen}
        path={path}
        onClose={() => setUndoOpen(false)}
      />

      <AlertDialog
        open={!!pendingConfirm}
        onOpenChange={(open) => {
          if (!open) setPendingConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("tools.confirmTitle", { label: pendingConfirm?.label ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-xs">
              {t("tools.confirmDesc", { run: pendingConfirm?.run ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingConfirm) runAction(pendingConfirm);
                setPendingConfirm(null);
              }}
            >
              {t("tools.run")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
