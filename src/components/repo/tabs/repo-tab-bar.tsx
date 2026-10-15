import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import { AddRepoButton } from "./add-repo-button";
import { ForestNodes } from "./repo-group";
import { RepoStripStyleContext } from "./repo-strip-style";
import { RepoTabPicker } from "./repo-tab-picker";
import { RepoWorkspaceSwitch } from "./repo-workspace-switch";
import { RepoForestDnd, useRepoForest } from "./use-repo-forest";
import { m } from "motion/react";

export function RepoTabBar({
  variant = "classic",
  withWorkspaceSwitch = true,
}: {
  variant?: "classic" | "labeled" | "flat";
  withWorkspaceSwitch?: boolean;
}) {
  const { activePath, activeLoading } = useRepoStore(
    useShallow((s) => ({
      activePath: s.activePath,
      activeLoading: s.activePath ? !!s.loading[s.activePath] : false,
    })),
  );
  const { filteredForest, sortableKeys, pickerPaths } = useRepoForest();

  const stripRef = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !activePath) return;
    const el = strip.querySelector<HTMLElement>(
      `[data-repo-path="${CSS.escape(activePath)}"]`,
    );
    el?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activePath, filteredForest]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const measure = () => {
      setOverflowing(strip.scrollWidth > strip.clientWidth + 2);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    for (const el of Array.from(strip.children)) observer.observe(el);
    strip.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      strip.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [filteredForest, activePath]);

  return (
    <div className="relative flex min-w-0 flex-1 items-stretch self-stretch">
      {activePath && activeLoading && (
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 h-0.5 overflow-hidden"
          aria-hidden
        >
          <m.div
            className="h-full w-full bg-gradient-to-r from-transparent via-primary/60 to-transparent"
            animate={{ x: ["-100%", "100%"] }}
            transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 items-stretch gap-1.5 pr-1">
        {withWorkspaceSwitch && (
          <div
            className="flex shrink-0 items-center"
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          >
            <RepoWorkspaceSwitch />
          </div>
        )}
        <div
          ref={stripRef}
          data-tauri-drag-region
          style={{ WebkitAppRegion: "drag" } as CSSProperties}
          className={cn(
            "relative flex min-w-0 flex-1 items-stretch gap-1 self-stretch overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            variant !== "flat" && "pt-1",
          )}
        >
          <RepoStripStyleContext.Provider value={variant}>
            <RepoForestDnd sortableKeys={sortableKeys}>
              <ForestNodes nodes={filteredForest} activePath={activePath} />
            </RepoForestDnd>
          </RepoStripStyleContext.Provider>
        </div>
        <div
          className="flex shrink-0 items-center gap-1"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <RepoTabPicker
            paths={pickerPaths}
            activePath={activePath}
            overflowing={overflowing}
          />
          <div className="h-4 w-0.5 rounded-full bg-foreground/5" aria-hidden />
          <AddRepoButton />
        </div>
      </div>
    </div>
  );
}
