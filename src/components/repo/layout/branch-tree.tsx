import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BranchCleanupDialog } from "@/components/repo/branch/branch-cleanup-dialog";
import { useBranchCleanupPrefs } from "@/lib/branch-cleanup-prefs";
import { useBranchCleanupStore } from "@/lib/branch-cleanup-store";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { BranchSection } from "@/components/repo/branch/branch-section";
import { StackSection } from "@/components/repo/branch/stack-section";
import { totalStackBranches } from "@/lib/stack";
import { useStackStore } from "@/lib/stack-store";
import { TagSection } from "@/components/repo/tag/tag-section";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PopIn } from "@/components/motion/pop-in";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSidebarPrefs } from "@/lib/sidebar-prefs";
import type { Branch, TagRef } from "@/lib/repo-store";
import { Brush, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

function SectionCount({ count }: { count: number }) {
  return (
    <PopIn key={count} className="shrink-0">
      <span className="text-[0.6875rem] font-medium tabular-nums text-muted-foreground/80">
        {count > 99 ? "99+" : count}
      </span>
    </PopIn>
  );
}

function Section({
  value,
  label,
  count,
  onCleanup,
  cleanupCount,
  children,
}: {
  value: string;
  label: string;
  count: number;
  onCleanup?: () => void;
  cleanupCount?: number;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const trigger = (
    <AccordionTrigger className="group/trigger my-px flex w-full min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left hover:bg-foreground/[0.04] hover:no-underline [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground/60">
        <span className="min-w-0 flex-1 truncate text-[0.75rem] font-medium text-muted-foreground group-data-[state=open]/trigger:text-foreground">
          {label}
        </span>
      <SectionCount count={count} />
    </AccordionTrigger>
  );

  return (
    <AccordionItem value={value} className="min-w-0 border-0">
      {onCleanup ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{trigger}</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={onCleanup}>
              <Brush className="h-3.5 w-3.5" aria-hidden />
              <span>{t("branchCleanup.buttonLabel")}</span>
              {cleanupCount ? (
                <span className="ml-auto text-[0.625rem] font-semibold tabular-nums text-git-modified">
                  {cleanupCount > 99 ? "99+" : cleanupCount}
                </span>
              ) : null}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        trigger
      )}
      <AccordionContent className="pb-0 pt-0 [&>div]:pb-1 [&>div]:pt-0.5">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

interface BranchTreeProps {
  path: string;
  branches: Branch[];
  tags: TagRef[];
  onDelete: (b: Branch, force: boolean) => void | Promise<void>;
}

export function BranchTree({ path, branches, tags, onDelete }: BranchTreeProps) {
  const { t } = useTranslation();
  const showBranchFilter = useSidebarPrefs((s) => s.showBranchFilter);
  const defaultOpenSections = useSidebarPrefs((s) => s.defaultOpenSections);
  const showStacksSection = useSidebarPrefs((s) => s.showStacksSection);
  const showTagsSection = useSidebarPrefs((s) => s.showTagsSection);
  const openSections = useSidebarPrefs((s) => s.openSections);
  const setOpenSections = useSidebarPrefs((s) => s.setOpenSections);
  const [query, setQuery] = useState("");
  const hasQuery = query.trim().length > 0;

  const { localBranches, remoteBranches } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (b: Branch) => !q || b.name.toLowerCase().includes(q);
    return {
      localBranches: branches.filter((b) => !b.is_remote && match(b)),
      remoteBranches: branches.filter((b) => b.is_remote && match(b)),
    };
  }, [branches, query]);

  const filteredTags = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tags.filter((tg) => !q || tg.name.toLowerCase().includes(q));
  }, [tags, query]);

  const totalRemoteBranches = useMemo(
    () => branches.filter((b) => b.is_remote).length,
    [branches],
  );
  const hasAnyMatch =
    localBranches.length + remoteBranches.length + filteredTags.length > 0;

  const stackList = useStackStore((s) => s.lists[path]);
  const stackCount = stackList ? totalStackBranches(stackList) : 0;

  const [cleanupOpen, setCleanupOpen] = useState(false);
  const staleDays = useBranchCleanupPrefs((s) => s.staleDays);
  const hintOnRepoOpen = useBranchCleanupPrefs((s) => s.hintOnRepoOpen);
  const loadCleanup = useBranchCleanupStore((s) => s.load);
  const cleanupCount = useBranchCleanupStore((s) => s.candidates[path]?.length ?? 0);

  useEffect(() => {
    if (!hintOnRepoOpen || !path) return;
    void loadCleanup(path, staleDays);
  }, [hintOnRepoOpen, path, staleDays, loadCleanup]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {showBranchFilter && (
        <div className="shrink-0 px-2 pb-1.5 pt-0.5">
          <label className="group relative flex items-center">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground/60 transition-colors group-focus-within:text-foreground"
            />
            <Input
              type="search"
              inputSize="sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("sidebar.filterPlaceholder")}
              aria-label={t("sidebar.filterAria")}
              className="h-8 rounded-xl border-border/50 bg-background pl-8 pr-7 shadow-none focus-visible:border-ring dark:bg-white/[0.04] [&::-webkit-search-cancel-button]:hidden"
            />
            {hasQuery && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setQuery("")}
                aria-label={t("sidebar.resetFilterAria")}
                className="absolute right-1"
              >
                <X />
              </Button>
            )}
          </label>
        </div>
      )}

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="w-full min-w-0 max-w-full overflow-x-hidden px-1.5 pb-3 pt-0.5">
          <Accordion
            type="multiple"
            value={openSections ?? [...defaultOpenSections, "stacks"]}
            onValueChange={setOpenSections}
            className="w-full min-w-0"
          >
            <Section
              value="local"
              label={t("sidebar.local")}
              count={localBranches.length}
              onCleanup={path ? () => setCleanupOpen(true) : undefined}
              cleanupCount={cleanupCount}
            >
              <BranchSection
                path={path}
                title={t("sidebar.local")}
                groupScope="local"
                branches={localBranches}
                emptyLabel={hasQuery ? t("common.noResults") : t("sidebar.noLocalBranches")}
                onDelete={onDelete}
                hideHeader
              />
            </Section>

            {path && showStacksSection ? (
              <Section
                value="stacks"
                label={t("stack.sectionTitle")}
                count={stackCount}
              >
                <StackSection path={path} />
              </Section>
            ) : null}

            {totalRemoteBranches > 0 && (
              <Section
                value="remote"
                label={t("sidebar.remote")}
                count={remoteBranches.length}
                onCleanup={path ? () => setCleanupOpen(true) : undefined}
                cleanupCount={cleanupCount}
              >
                <BranchSection
                  path={path}
                  title={t("sidebar.remote")}
                  groupScope="remote"
                  branches={remoteBranches}
                  emptyLabel={t("common.noResults")}
                  hideHeader
                />
              </Section>
            )}

            {showTagsSection && tags.length > 0 && (
              <Section
                value="tags"
                label={t("sidebar.tags")}
                count={filteredTags.length}
                onCleanup={path ? () => setCleanupOpen(true) : undefined}
                cleanupCount={cleanupCount}
              >
                <TagSection
                  path={path}
                  title={t("sidebar.tags")}
                  tags={filteredTags}
                  emptyLabel={hasQuery ? t("common.noResults") : t("sidebar.noTags")}
                  hideHeader
                />
              </Section>
            )}
          </Accordion>

          {hasQuery && !hasAnyMatch && (
            <PopIn className="w-full">
              <div className="mx-1 w-full rounded-xl px-3 py-5 text-center text-xs text-muted-foreground">
                {t("sidebar.noBranchesForQuery", { query: query.trim() })}
              </div>
            </PopIn>
          )}
        </div>
      </ScrollArea>

      {path ? (
        <BranchCleanupDialog
          open={cleanupOpen}
          onClose={() => setCleanupOpen(false)}
          path={path}
        />
      ) : null}
    </div>
  );
}
