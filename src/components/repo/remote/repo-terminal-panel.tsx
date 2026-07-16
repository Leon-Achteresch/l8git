import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { repoDefaultTabTitle } from "@/lib/terminal-tab-title";
import { useCommandHistory } from "@/lib/terminal/command-history";
import {
  terminalLeafId,
  writeToSession,
} from "@/lib/terminal/use-terminal-session";
import { useRepoStore } from "@/lib/repo-store";
import { useTerminalStore, type TerminalTab } from "@/lib/terminal-store";
import { History, Plus, SquareTerminal, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isDarkMode, RepoTerminalSession } from "./repo-terminal-session";

interface Props {
  path: string;
}

const EMPTY_TABS: TerminalTab[] = [];

export function RepoTerminalPanel({ path }: Props) {
  const { t } = useTranslation();
  const tabs = useTerminalStore((s) => s.tabsByPath[path] ?? EMPTY_TABS);
  const activeId = useTerminalStore((s) => s.activeByPath[path] ?? null);
  const setVisible = useTerminalStore((s) => s.setVisible);
  const openTab = useTerminalStore((s) => s.openTab);
  const closeTab = useTerminalStore((s) => s.closeTab);
  const setActiveTab = useTerminalStore((s) => s.setActiveTab);
  const renameTab = useTerminalStore((s) => s.renameTab);
  const branch = useRepoStore((s) => s.repos[path]?.branch ?? "");

  const [isDark, setIsDark] = useState(() => isDarkMode());
  const defaultTitle = repoDefaultTabTitle(path, branch);

  useEffect(() => {
    const update = () => setIsDark(isDarkMode());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (tabs.length === 0) {
      openTab(path, defaultTitle);
    }
  }, [path, tabs.length, openTab, defaultTitle]);

  const bg = isDark ? "#0b0b0d" : "#ffffff";

  return (
    <div
      className="flex h-full min-h-0 flex-col text-foreground"
      style={{ backgroundColor: bg }}
    >
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-muted/60 px-1.5">
        <div
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label={t("embeddedTerminal.tabsAria")}
        >
          {tabs.map((tab) => {
            const active = tab.id === activeId;
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={active}
                className={cn(
                  "group flex h-7 min-w-0 max-w-[190px] shrink-0 items-center gap-1.5 rounded-md pr-1.5 pl-2.5 text-xs transition-colors",
                  active
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab(path, tab.id)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left"
                  title={tab.title}
                >
                  <SquareTerminal
                    className={cn(
                      "size-3.5 shrink-0",
                      active ? "text-primary" : "text-muted-foreground/70",
                    )}
                  />
                  <span className="truncate">{tab.title}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(path, tab.id);
                  }}
                  title={t("embeddedTerminal.closeTab")}
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-muted-foreground/20 group-hover:opacity-100 focus-visible:opacity-100",
                    active && "opacity-60",
                  )}
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            title={t("embeddedTerminal.newTab")}
            onClick={() => openTab(path, defaultTitle)}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 border-l border-border/60 pl-1">
          <CommandHistoryPopover path={path} activeId={activeId} />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={t("embeddedTerminal.close")}
            onClick={() => setVisible(path, false)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {tabs.map((tab) => (
          <RepoTerminalSession
            key={tab.id}
            path={path}
            tabId={tab.id}
            active={tab.id === activeId}
            isDark={isDark}
            onTitleChange={(title) => renameTab(path, tab.id, title)}
          />
        ))}
      </div>
    </div>
  );
}

function CommandHistoryPopover({
  path,
  activeId,
}: {
  path: string;
  activeId: string | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const entries = useCommandHistory((s) => s.byPath[path]) ?? [];
  const remove = useCommandHistory((s) => s.remove);
  const clear = useCommandHistory((s) => s.clear);

  const runCommand = (cmd: string) => {
    if (!activeId) return;
    writeToSession(terminalLeafId(path, activeId), cmd);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={t("embeddedTerminal.history")}
        >
          <History className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <Command>
          <CommandInput placeholder={t("embeddedTerminal.historySearch")} />
          <CommandList>
            <CommandEmpty>{t("embeddedTerminal.historyEmpty")}</CommandEmpty>
            <CommandGroup>
              {entries.map((entry) => (
                <CommandItem
                  key={entry.cmd}
                  value={entry.cmd}
                  onSelect={() => runCommand(entry.cmd)}
                  className="group"
                >
                  <SquareTerminal className="size-3 shrink-0 text-muted-foreground/70" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">
                    {entry.cmd}
                  </span>
                  {entry.count > 1 && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      ×{entry.count}
                    </span>
                  )}
                  <button
                    type="button"
                    title={t("embeddedTerminal.historyDelete")}
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(path, entry.cmd);
                    }}
                    className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted-foreground/15 group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {entries.length > 0 && (
            <div className="border-t border-border/50 p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs text-muted-foreground"
                onClick={() => clear(path)}
              >
                <Trash2 className="size-3" />
                {t("embeddedTerminal.historyClear")}
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
