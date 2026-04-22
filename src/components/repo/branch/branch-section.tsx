import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { groupBranchesByKind, groupSignature } from "@/lib/branch-groups";
import { laneColor } from "@/lib/graph";
import type { Branch } from "@/lib/repo-store";
import { Plus } from "lucide-react";
import { useMemo } from "react";
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
  const groups = useMemo(
    () => groupBranchesByKind(branches),
    [branches],
  );
  const sig = groupSignature(groups);
  const defaultOpen = useMemo(
    () => groups.map((g) => g.id),
    [groups],
  );

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
      {groups.length === 0 ? null : (
        <Accordion
          key={sig}
          type="multiple"
          defaultValue={defaultOpen}
          className="w-full"
        >
          {groups.map((g) => (
            <AccordionItem
              key={g.id}
              value={g.id}
              className="border-0"
            >
              <AccordionTrigger className="py-1.5 pr-0 text-left text-xs font-medium text-muted-foreground hover:no-underline">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {g.label}
                  </span>
                  <Badge
                    variant="outline"
                    className="shrink-0 text-[10px] tabular-nums"
                  >
                    {g.branches.length}
                  </Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-0 pt-0 [&>div]:pb-1.5">
                <ul className="space-y-0.5">
                  {g.branches.map((b) => (
                    <BranchRow
                      key={b.name}
                      path={path}
                      branch={b}
                      laneColor={laneColor(b.name)}
                      onDelete={onDelete}
                    />
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
