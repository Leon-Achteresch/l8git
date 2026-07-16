import { SPRING_LAYOUT, SPRING_PANEL } from "@/@lib/ease";
import { repoDefaultTabTitle } from "@/lib/terminal-tab-title";
import { isDarkMode, terminalBackground } from "@/lib/terminal/terminal-theme";
import { useRepoStore } from "@/lib/repo-store";
import { useTerminalStore, type TerminalTab } from "@/lib/terminal-store";
import { cn } from "@/lib/utils";
import { Plus, SquareTerminal, X } from "lucide-react";
import { LayoutGroup, m } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RepoTerminalSession } from "./repo-terminal-session";
import { TerminalCommandHistory } from "./terminal-command-history";
import { TerminalDockToggle } from "./terminal-dock-toggle";
import { TerminalTabChip } from "./terminal-tab-chip";

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
  const position = useTerminalStore((s) => s.position);
  const setPosition = useTerminalStore((s) => s.setPosition);
  const branch = useRepoStore((s) => s.repos[path]?.branch ?? "");

  const [isDark, setIsDark] = useState(() => isDarkMode());
  const defaultTitle = repoDefaultTabTitle(path, branch);
  const layoutGroup = `term-${path}`;

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

  return (
    <m.div
      layout
      transition={SPRING_LAYOUT}
      className="terminal-panel flex h-full min-h-0 flex-col text-foreground"
      style={{ backgroundColor: terminalBackground() }}
    >
      <header className="terminal-panel-chrome relative flex shrink-0 flex-col gap-2 border-b border-border/50 px-2.5 py-2">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.06] ring-1 ring-border/50">
              <SquareTerminal className="size-3.5 text-foreground/80" />
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[12px] font-semibold tracking-tight">
                {t("embeddedTerminal.title")}
              </div>
              <div className="hidden text-[10px] text-muted-foreground sm:block">
                Ctrl+`
              </div>
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <TerminalCommandHistory path={path} activeId={activeId} />
            <TerminalDockToggle
              position={position}
              onChange={setPosition}
              dockBottomLabel={t("embeddedTerminal.dockBottom")}
              dockRightLabel={t("embeddedTerminal.dockRight")}
            />
            <button
              type="button"
              title={t("embeddedTerminal.close")}
              onClick={() => setVisible(path, false)}
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] hover:bg-foreground/8 hover:text-foreground active:scale-95"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        <LayoutGroup id={layoutGroup}>
          <div
            className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-foreground/[0.04] p-0.5 ring-1 ring-border/40 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label={t("embeddedTerminal.tabsAria")}
          >
            {tabs.map((tab) => (
              <TerminalTabChip
                key={tab.id}
                path={path}
                tab={tab}
                active={tab.id === activeId}
                layoutGroup={layoutGroup}
                onSelect={() => setActiveTab(path, tab.id)}
                onClose={() => closeTab(path, tab.id)}
                closeLabel={t("embeddedTerminal.closeTab")}
              />
            ))}
            <button
              type="button"
              title={t("embeddedTerminal.newTab")}
              onClick={() => openTab(path, defaultTitle)}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] hover:bg-background hover:text-foreground hover:shadow-sm active:scale-95",
              )}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </LayoutGroup>
      </header>

      <m.div
        layout
        transition={SPRING_PANEL}
        className="terminal-panel-body relative min-h-0 flex-1"
      >
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
      </m.div>
    </m.div>
  );
}
