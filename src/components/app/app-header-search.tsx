import { lazy, Suspense, useState, type CSSProperties } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { Button } from "@/components/ui/button";
import { useHotkeyBindings } from "@/lib/hotkey-prefs";
import { useEverTrue } from "@/lib/use-ever-true";
import { cn } from "@/lib/utils";

const AppCommandPalette = lazy(() => import("./app-command-palette").then(m => ({ default: m.AppCommandPalette })));
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";

export function AppHeaderSearch({ variant = "pill" }: { variant?: "pill" | "wide" | "icon" } = {}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const used = useEverTrue(open);
  const bindings = useHotkeyBindings();
  useHotkeys([{
    hotkey: bindings.commandPalette,
    callback: () => setOpen(previous => !previous),
    options: { preventDefault: true, meta: { name: t("hotkeys.commandPalette") } },
  }]);

  return <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        aria-label={t("appSearch.triggerPlaceholder")}
        title={`${t("appSearch.triggerPlaceholder")} (${MOD_KEY}K)`}
        className={cn(
          "gap-2 text-muted-foreground hover:bg-muted hover:text-foreground",
          variant === "pill" && "h-7 max-w-[220px] rounded-full border border-border/60 bg-muted/40 px-2.5",
          variant === "wide" && "h-8 w-full max-w-[380px] justify-start rounded-xl border border-border/50 bg-foreground/[0.035] px-2.5",
          variant === "icon" && "size-8 rounded-xl p-0",
        )}
      >
        <Search className="size-3.5 shrink-0" strokeWidth={1.75} />
        {variant !== "icon" && (
          <>
            <span
              className={cn(
                "min-w-0 truncate text-[0.6875rem] font-normal",
                variant === "pill" ? "hidden lg:inline" : "flex-1 text-left text-xs",
              )}
            >
              {t("appSearch.triggerPlaceholder")}
            </span>
            <kbd
              className={cn(
                "rounded-md bg-background/80 px-1 py-px font-sans text-[0.625rem] text-muted-foreground/80",
                variant === "pill" ? "hidden lg:inline" : "ms-auto shrink-0",
              )}
            >
              {MOD_KEY}K
            </kbd>
          </>
        )}
      </Button>

    {used && <Suspense fallback={null}><AppCommandPalette open={open} setOpen={setOpen} /></Suspense>}
  </>;
}
