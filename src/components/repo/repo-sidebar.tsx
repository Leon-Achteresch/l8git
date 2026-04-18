import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRepoStore, type Branch } from "@/lib/repo-store";
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useUiStore,
  type SidebarTab,
} from "@/lib/ui-store";
import { Cloud, GitBranch, GitCommitHorizontal, History } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BranchSection } from "./branch-section";

export function RepoSidebar() {
  const activePath = useRepoStore((s) => s.activePath);
  const repo = useRepoStore((s) => (activePath ? s.repos[activePath] : null));
  const deleteBranch = useRepoStore((s) => s.deleteBranch);
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth);
  const sidebarTab = useUiStore((s) => s.sidebarTab);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);

  const asideRef = useRef<HTMLElement | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const onMove = (e: PointerEvent) => {
      const left = asideRef.current?.getBoundingClientRect().left ?? 0;
      setSidebarWidth(e.clientX - left);
    };
    const onUp = () => setIsResizing(false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [isResizing, setSidebarWidth]);

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
    <aside
      ref={asideRef}
      className="relative flex min-h-0 shrink-0 flex-col border-r"
      style={{ width: sidebarWidth }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="p-3">
          <Tabs
            orientation="vertical"
            value={sidebarTab}
            onValueChange={(v) => setSidebarTab(v as SidebarTab)}
          >
            <TabsList variant="line" className="w-full">
              <TabsTrigger value="commit">
                <GitCommitHorizontal />
                Commit
              </TabsTrigger>
              <TabsTrigger value="history">
                <History />
                History
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Separator />
        <ScrollArea className="min-h-0 flex-1">
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
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={sidebarWidth}
        onPointerDown={onPointerDown}
        className={`absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize select-none transition-colors hover:bg-accent ${
          isResizing ? "bg-accent" : ""
        }`}
      />
    </aside>
  );
}
