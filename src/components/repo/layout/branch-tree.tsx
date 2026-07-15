import { BranchSection } from "@/components/repo/branch/branch-section";
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
import { Search, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

function SectionCount({ count }: { count: number }) {
  return (
    <PopIn key={count} className="shrink-0">
      <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-md bg-muted/70 px-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
        {count > 99 ? "99+" : count}
      </span>
    </PopIn>
  );
}

function Section({
  value,
  label,
  count,
  children,
}: {
  value: string;
  label: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <AccordionItem value={value} className="min-w-0 border-0">
      <AccordionTrigger className="group/trigger my-px flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left hover:no-underline hover:bg-sidebar-accent/30 [&>svg]:shrink-0 [&>svg]:text-muted-foreground/70">
        <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground group-data-[state=open]/trigger:text-foreground">
          {label}
        </span>
        <SectionCount count={count} />
      </AccordionTrigger>
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

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {showBranchFilter && (
        <div className="shrink-0 px-2 pb-1 pt-1.5">
          <label className="group relative flex items-center">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground/70 transition-colors group-focus-within:text-foreground"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("sidebar.filterPlaceholder")}
              aria-label={t("sidebar.filterAria")}
              className="h-7 w-full rounded-md border border-transparent bg-muted/50 pl-7 pr-7 text-xs text-foreground placeholder:text-muted-foreground/80 outline-none transition-[background,border-color] focus:border-ring focus:bg-background [&::-webkit-search-cancel-button]:hidden"
            />
            {hasQuery && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("sidebar.resetFilterAria")}
                className="absolute right-1 flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </label>
        </div>
      )}

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="w-full min-w-0 max-w-full overflow-x-hidden px-2 pb-3 pt-1">
          <Accordion
            type="multiple"
            defaultValue={defaultOpenSections}
            className="w-full min-w-0"
          >
            <Section
              value="local"
              label={t("sidebar.local")}
              count={localBranches.length}
            >
              <BranchSection
                path={path}
                title={t("sidebar.local")}
                branches={localBranches}
                emptyLabel={hasQuery ? t("common.noResults") : t("sidebar.noLocalBranches")}
                onDelete={onDelete}
                hideHeader
              />
            </Section>

            {totalRemoteBranches > 0 && (
              <Section
                value="remote"
                label={t("sidebar.remote")}
                count={remoteBranches.length}
              >
                <BranchSection
                  path={path}
                  title={t("sidebar.remote")}
                  branches={remoteBranches}
                  emptyLabel={t("common.noResults")}
                  hideHeader
                />
              </Section>
            )}

            {tags.length > 0 && (
              <Section
                value="tags"
                label={t("sidebar.tags")}
                count={filteredTags.length}
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
              <div className="mx-1 w-full rounded-md border border-dashed border-sidebar-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
                {t("sidebar.noBranchesForQuery", { query: query.trim() })}
              </div>
            </PopIn>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
