import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { repoDefaultTabTitle } from "@/lib/terminal-tab-title";
import { useRepoStore } from "@/lib/repo-store";
import { useTerminalStore } from "@/lib/terminal-store";
import { Plus, SquareTerminal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isDarkMode, RepoTerminalSession } from "./repo-terminal-session";

interface Props {
  path: string;
}

export function RepoTerminalPanel({ path }: Props) {
  const { t } = useTranslation();
  const tabs = useTerminalStore((s) => s.tabsByPath[path] ?? []);
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
      className="flex h-full min-h-0 flex-col text-xs text-foreground"
      style={{ backgroundColor: bg }}
    >
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-border/50 bg-muted/40 px-3 text-xs">
        <div className="flex items-center gap-2">
          <SquareTerminal className="size-3.5 text-muted-foreground" />
          <span className="font-medium">{t("embeddedTerminal.title")}</span>
          {tabs.length > 0 && (
            <span className="text-muted-foreground">
              · {t("embeddedTerminal.tabsCount", { count: tabs.length })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={t("embeddedTerminal.newTab")}
            onClick={() => openTab(path, defaultTitle)}
          >
            <Plus className="size-3.5" />
          </Button>
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
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
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
        <div
          className="flex w-44 shrink-0 flex-col border-l border-border/60 bg-muted/30"
          aria-label={t("embeddedTerminal.tabsAria")}
        >

          <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1">
            {tabs.map((tab) => {
              const active = tab.id === activeId;
              return (
                <li key={tab.id}>
                  <div
                    className={cn(
                      "group flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveTab(path, tab.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 truncate text-left"
                      title={tab.title}
                    >
                      <SquareTerminal
                        className={cn(
                          "size-3 shrink-0",
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
                        "rounded p-0.5 opacity-0 transition-opacity hover:bg-muted-foreground/15 group-hover:opacity-100",
                        active && "opacity-70",
                      )}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
