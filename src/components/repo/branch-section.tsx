import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { laneColor } from "@/lib/graph";
import type { Branch } from "@/lib/repo-store";
import { Plus } from "lucide-react";
import { BranchRow } from "./branch-row";

export function BranchSection({
  path,
  title,
  icon,
  branches,
  onDelete,
  showNewBranch,
  onNewBranch,
}: {
  path: string;
  title: string;
  icon: React.ReactNode;
  branches: Branch[];
  onDelete?: (b: Branch, force: boolean) => void;
  showNewBranch?: boolean;
  onNewBranch?: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
        {icon}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <div className="flex shrink-0 items-center gap-1">
          {showNewBranch && onNewBranch ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6"
              title="Neuer Branch"
              aria-label="Neuer Branch"
              onClick={() => onNewBranch()}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          <Badge variant="outline">{branches.length}</Badge>
        </div>
      </div>
      <ul className="space-y-0.5">
        {branches.map((b) => (
          <BranchRow
            key={b.name}
            path={path}
            branch={b}
            laneColor={laneColor(b.name)}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </div>
  );
}
