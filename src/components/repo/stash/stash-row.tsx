import { ListRow } from "@/components/ui/list-row";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Badge } from "@/components/ui/badge";
import { toastError } from "@/lib/error-toast";
import { formatDate } from "@/lib/format";
import type { StashEntry } from "@/lib/repo-store";
import { useRepoStore } from "@/lib/repo-store";
import { Archive, GitBranch, Inbox, Layers, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function StashRow({
  path,
  entry,
  selected,
  onSelect,
  onOpenBranch,
}: {
  path: string;
  entry: StashEntry;
  selected: boolean;
  onSelect: () => void;
  onOpenBranch: () => void;
}) {
  const { t } = useTranslation();
  const stashApply = useRepoStore((s) => s.stashApply);
  const stashPop = useRepoStore((s) => s.stashPop);
  const stashDrop = useRepoStore((s) => s.stashDrop);

  const branchLabel = entry.branch.trim() || "—";
  const title = entry.subject.trim() || entry.message;

  const inner = (
    <ListRow
      variant="accent"
      active={selected}
      onClick={onSelect}
      className="cursor-pointer items-start rounded-lg"
    >
      <Archive className="mt-0.5 opacity-70" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] opacity-60">
            {`stash@{${entry.index}}`}
          </span>
          <Badge variant="outline" className="max-w-[140px] truncate text-[10px]">
            {branchLabel}
          </Badge>
        </div>
        <p className="mt-0.5 truncate font-medium text-foreground/90">{title}</p>
        <p className="mt-0.5 text-[10px] opacity-60">{formatDate(entry.date)}</p>
      </div>
    </ListRow>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{inner}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onSelect={() => {
            void (async () => {
              try {
                const out = await stashApply(path, entry.index);
                toast.success(out || t("stash.toastApplyFallback"));
              } catch (e) {
                toastError(String(e));
              }
            })();
          }}
        >
          <Layers className="h-3.5 w-3.5" />
          {t("stash.menuApply")}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            const ok = window.confirm(t("stash.confirmPop"));
            if (!ok) return;
            void (async () => {
              try {
                const out = await stashPop(path, entry.index);
                toast.success(out || t("stash.toastPopFallback"));
              } catch (e) {
                toastError(String(e));
              }
            })();
          }}
        >
          <Inbox className="h-3.5 w-3.5" />
          {t("stash.menuPop")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onOpenBranch()}>
          <GitBranch className="h-3.5 w-3.5" />
          {t("stash.menuCreateBranch")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onSelect={() => {
            const ok = window.confirm(t("stash.confirmDrop", { ref: `stash@{${entry.index}}` }));
            if (!ok) return;
            void (async () => {
              try {
                await stashDrop(path, entry.index);
                toast.success(t("stash.toastDropSuccess"));
              } catch (e) {
                toastError(String(e));
              }
            })();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("common.remove")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
