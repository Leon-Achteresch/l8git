import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { groupBranchesByKind } from "@/lib/branch-groups";
import { useSidebarPrefs } from "@/lib/sidebar-prefs";
import { laneColor } from "@/lib/graph";
import type { Branch } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BranchRow } from "./branch-row";

export function BranchSection({
  path,
  title,
  icon,
  branches,
  emptyLabel,
  onDelete,
  showNewBranch,
  onNewBranch,
  hideHeader,
  groupScope,
}: {
  path: string;
  title: string;
  groupScope?: string;
  icon?: React.ReactNode;
  branches: Branch[];
  emptyLabel?: string;
  onDelete?: (b: Branch, force: boolean) => void;
  showNewBranch?: boolean;
  onNewBranch?: () => void;
  hideHeader?: boolean;
}) {
  const { t } = useTranslation();
  const grouping = useMemo(() => groupBranchesByKind(branches), [branches]);
  const closedGroups = useSidebarPrefs((s) => s.closedBranchGroups);
  const setBranchGroupOpen = useSidebarPrefs((s) => s.setBranchGroupOpen);
  const scope = groupScope ?? title.toLowerCase();
  const openGroups = useMemo(
    () =>
      grouping.groups
        .map((g) => g.id)
        .filter((id) => !closedGroups.includes(`${scope}:${id}`)),
    [grouping, closedGroups, scope],
  );

  const isEmpty = grouping.flat.length === 0 && grouping.groups.length === 0;

  return (
    <section className="flex w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      {!hideHeader && (
        <header
          className={cn(
            "mb-1 grid w-full min-w-0 items-center gap-2 px-2",
            icon != null
              ? "grid-cols-[auto_minmax(0,1fr)_auto]"
              : "grid-cols-[minmax(0,1fr)_auto]",
          )}
        >
          {icon ? <span className="justify-self-start text-muted-foreground">{icon}</span> : null}
          <h3 className="min-w-0 justify-self-stretch truncate text-[0.75rem] font-medium text-muted-foreground">
            {title}
          </h3>
          <span className="flex shrink-0 items-center justify-end gap-0.5">
            <span
              className="text-[0.6875rem] font-medium tabular-nums text-muted-foreground/80"
              aria-label={t("branch.countAria", { count: branches.length })}
            >
              {branches.length}
            </span>
            {showNewBranch && onNewBranch ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="h-5 w-5 text-muted-foreground hover:text-foreground"
                title={t("sidebar.newBranchTitle")}
                aria-label={t("sidebar.newBranchAria")}
                onClick={() => onNewBranch()}
              >
                <Plus className="h-3 w-3" />
              </Button>
            ) : null}
          </span>
        </header>
      )}

      {isEmpty ? (
        <p className={cn("px-2 pb-1 text-[0.6875rem] text-muted-foreground/70", hideHeader && "pt-1")}>
          {emptyLabel ?? t("branch.defaultEmpty")}
        </p>
      ) : (
        <>
          {grouping.flat.length > 0 && (
            <ul className="mb-0.5 min-w-0 space-y-0.5">
              {grouping.flat.map((b) => (
                <BranchRow
                  key={b.name}
                  path={path}
                  branch={b}
                  laneColor={laneColor(b.name)}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          )}

          {grouping.groups.length > 0 && (
            <Accordion
              type="multiple"
              value={openGroups}
              onValueChange={(open) => {
                for (const g of grouping.groups) {
                  setBranchGroupOpen(`${scope}:${g.id}`, open.includes(g.id));
                }
              }}
              className="w-full min-w-0 max-w-full"
            >
              {grouping.groups.map((g) => (
                <AccordionItem key={g.id} value={g.id} className="min-w-0 border-0">
                  <AccordionTrigger className="group/trigger my-px flex w-full min-w-0 max-w-full items-center justify-start gap-1.5 rounded-lg py-1 pl-2 pr-1.5 text-left text-[0.75rem] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground hover:no-underline data-[state=open]:text-foreground [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground/60">
                    <span className="min-w-0 flex-1 truncate">{g.label}</span>
                    <span className="shrink-0 text-[0.6875rem] font-medium tabular-nums text-muted-foreground/70">
                      {g.branches.length}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0 pt-0 [&>div]:pb-1 [&>div]:pt-0.5">
                    <ul className="min-w-0 space-y-0.5 pl-1">
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
        </>
      )}
    </section>
  );
}
