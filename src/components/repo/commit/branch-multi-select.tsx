import { PopIn } from "@/components/motion/pop-in";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { compareBranchesDisplay } from "@/lib/graph";
import type { Branch } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { AnimatePresence, m } from "motion/react";
import { Check, ChevronDown, Cloud, GitBranch, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const CHECK_SPRING = { type: "spring", stiffness: 560, damping: 30 } as const;

export function BranchMultiSelect({
  branches,
  selectedBranches,
  onSelectionChange,
}: {
  branches: Branch[];
  selectedBranches: ReadonlySet<string>;
  onSelectionChange: (names: ReadonlySet<string>) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const sorted = [...branches].sort(compareBranchesDisplay);
  const local = sorted.filter((b) => !b.is_remote);
  const remote = sorted.filter((b) => b.is_remote);

  const toggleBranch = (name: string) => {
    const next = new Set(selectedBranches);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    onSelectionChange(next);
  };

  const clearAll = () => onSelectionChange(new Set());

  const count = selectedBranches.size;
  const label =
    count === 0
      ? t("toolbar.branchMultiAll")
      : count === 1
        ? ([...selectedBranches][0] ?? t("toolbar.branchMultiOne"))
        : t("toolbar.branchMultiMany", { count });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "group h-8 gap-1.5 pl-1 pr-2 text-xs font-normal transition-all duration-200",
            count > 0
              ? "border-primary/40 bg-primary/5 text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-md transition-colors duration-200",
              count > 0
                ? "bg-primary text-primary-foreground"
                : "bg-muted/70 text-muted-foreground group-hover:bg-muted group-hover:text-foreground",
            )}
          >
            <GitBranch className="size-3.5" />
          </span>
          <PopIn key={label} className="min-w-0">
            <span className="max-w-44 truncate">{label}</span>
          </PopIn>
          {count > 1 && (
            <PopIn key={count}>
              <span className="flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold tabular-nums text-primary-foreground">
                {count}
              </span>
            </PopIn>
          )}
          {count > 0 ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label={t("toolbar.branchMultiClear")}
              title={t("toolbar.branchMultiClear")}
              onClick={(e) => {
                e.stopPropagation();
                clearAll();
              }}
              className="flex size-4 shrink-0 items-center justify-center rounded-full text-primary/70 transition-colors hover:bg-primary/15 hover:text-primary"
            >
              <X className="size-3" />
            </span>
          ) : (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground transition-transform duration-200 in-data-[state=open]:rotate-180" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 overflow-hidden p-0"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold">
            {t("toolbar.branchFilterTitle")}
          </span>
          <AnimatePresence initial={false}>
            {count > 0 && (
              <m.span
                key="count"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={CHECK_SPRING}
                className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground"
              >
                {t("toolbar.branchMultiSelected", { count })}
              </m.span>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence initial={false}>
          {count > 0 && (
            <m.div
              key="chips"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden border-b border-border bg-muted/30"
            >
              <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto p-2">
                <AnimatePresence initial={false}>
                  {[...selectedBranches].map((name) => (
                    <m.button
                      layout
                      key={name}
                      type="button"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={CHECK_SPRING}
                      onClick={() => toggleBranch(name)}
                      title={t("toolbar.branchMultiRemove", { name })}
                      className="flex h-6 min-w-0 items-center gap-1 rounded-md bg-primary/10 px-2 text-[11px] font-medium text-primary ring-1 ring-primary/25 transition-colors hover:bg-primary/20"
                    >
                      <GitBranch className="size-2.5 shrink-0 opacity-70" />
                      <span className="max-w-40 truncate">{name}</span>
                      <X className="size-2.5 shrink-0 opacity-70" />
                    </m.button>
                  ))}
                </AnimatePresence>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        <Command>
          <CommandInput placeholder={t("toolbar.branchMultiFilterPlaceholder")} />
          <CommandList>
            <CommandEmpty>{t("toolbar.branchMultiEmpty")}</CommandEmpty>
            {local.length > 0 && (
              <CommandGroup heading={t("sidebar.local")}>
                {local.map((b) => (
                  <BranchCommandItem
                    key={b.name}
                    branch={b}
                    selected={selectedBranches.has(b.name)}
                    onToggle={toggleBranch}
                  />
                ))}
              </CommandGroup>
            )}
            {local.length > 0 && remote.length > 0 && <CommandSeparator />}
            {remote.length > 0 && (
              <CommandGroup heading={t("sidebar.remote")}>
                {remote.map((b) => (
                  <BranchCommandItem
                    key={b.name}
                    branch={b}
                    selected={selectedBranches.has(b.name)}
                    onToggle={toggleBranch}
                  />
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>

        <AnimatePresence initial={false}>
          {count > 0 && (
            <m.div
              key="footer"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden border-t border-border"
            >
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {t("toolbar.branchMultiSelected", { count })}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="h-6 text-[11px] text-muted-foreground hover:text-destructive"
                  onClick={clearAll}
                >
                  <X className="size-3" />
                  {t("toolbar.branchMultiClear")}
                </Button>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  );
}

function BranchCommandItem({
  branch,
  selected,
  onToggle,
}: {
  branch: Branch;
  selected: boolean;
  onToggle: (name: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <CommandItem
      value={branch.name}
      onSelect={() => onToggle(branch.name)}
      className={cn("gap-2", selected && "bg-primary/5")}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input bg-background",
        )}
      >
        <AnimatePresence initial={false}>
          {selected && (
            <m.span
              key="check"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={CHECK_SPRING}
              className="flex"
            >
              <Check className="size-3" strokeWidth={3} />
            </m.span>
          )}
        </AnimatePresence>
      </span>
      {branch.is_remote ? (
        <Cloud className="size-3 shrink-0 text-muted-foreground" />
      ) : (
        <GitBranch className="size-3 shrink-0 text-git-branch" />
      )}
      <span className="min-w-0 flex-1 truncate">{branch.name}</span>
      {branch.is_current && (
        <span className="flex h-[16px] shrink-0 items-center rounded-full bg-git-added-subtle px-1.5 text-[9px] font-semibold uppercase tracking-wide text-git-added">
          {t("toolbar.currentBranch")}
        </span>
      )}
      {(branch.behind ?? 0) > 0 && (
        <span
          title={t("toolbar.behindCount", { count: branch.behind })}
          className="shrink-0 text-[10px] font-medium tabular-nums text-git-removed"
        >
          ↓{branch.behind}
        </span>
      )}
      <span className="shrink-0 font-mono text-[10px] text-git-hash">
        {branch.tip.slice(0, 7)}
      </span>
    </CommandItem>
  );
}
