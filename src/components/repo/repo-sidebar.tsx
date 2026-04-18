import { GitBranch, Cloud, Check, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useRepoStore, type Branch } from "@/lib/repo-store";
import { cn } from "@/lib/utils";

export function RepoSidebar() {
  const activePath = useRepoStore((s) => s.activePath);
  const repo = useRepoStore((s) => (activePath ? s.repos[activePath] : null));
  const deleteBranch = useRepoStore((s) => s.deleteBranch);

  if (!repo || !activePath) return null;

  const local = repo.branches.filter((b) => !b.is_remote);
  const remote = repo.branches.filter((b) => b.is_remote);

  const onDelete = async (b: Branch, force: boolean) => {
    try {
      await deleteBranch(activePath, b.name, force);
    } catch (e) {
      const msg = String(e);
      if (!force && /not fully merged/i.test(msg)) {
        const ok = window.confirm(
          `Branch "${b.name}" ist nicht gemerged. Trotzdem löschen?`,
        );
        if (ok) await onDelete(b, true);
        return;
      }
      window.alert(`Löschen fehlgeschlagen: ${msg}`);
    }
  };

  return (
    <aside className="w-64 shrink-0 border-r">
      <ScrollArea className="h-[calc(100vh-8rem)]">
        <div className="p-3">
          <BranchSection
            title="Lokal"
            icon={<GitBranch className="h-4 w-4" />}
            branches={local}
            onDelete={onDelete}
          />
          {remote.length > 0 && (
            <>
              <Separator className="my-3" />
              <BranchSection
                title="Remote"
                icon={<Cloud className="h-4 w-4" />}
                branches={remote}
              />
            </>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function BranchSection({
  title,
  icon,
  branches,
  onDelete,
}: {
  title: string;
  icon: React.ReactNode;
  branches: Branch[];
  onDelete?: (b: Branch, force: boolean) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
        {icon}
        {title}
        <Badge variant="outline" className="ml-auto">
          {branches.length}
        </Badge>
      </div>
      <ul className="space-y-0.5">
        {branches.map((b) => (
          <BranchRow key={b.name} branch={b} onDelete={onDelete} />
        ))}
      </ul>
    </div>
  );
}

function BranchRow({
  branch,
  onDelete,
}: {
  branch: Branch;
  onDelete?: (b: Branch, force: boolean) => void;
}) {
  const row = (
    <li
      className={cn(
        "flex cursor-default items-center gap-2 rounded px-2 py-1 text-sm",
        branch.is_current
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      {branch.is_current ? (
        <Check className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <span className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="truncate" title={branch.name}>
        {branch.name}
      </span>
    </li>
  );

  if (!onDelete) return row;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          variant="destructive"
          disabled={branch.is_current}
          onSelect={() => onDelete(branch, false)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Löschen
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          disabled={branch.is_current}
          onSelect={() => onDelete(branch, true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Erzwingen (−D)
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
