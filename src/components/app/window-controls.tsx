import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function runWindowAction(action: "minimize" | "toggleMaximize" | "close") {
  const win = getCurrentWindow();
  if (action === "minimize") await win.minimize();
  else if (action === "toggleMaximize") await win.toggleMaximize();
  else await win.close();
}

export function WindowControls() {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!IS_TAURI) return;
    const win = getCurrentWindow();
    let cancelled = false;
    const sync = () => {
      void win.isMaximized().then((value) => {
        if (!cancelled) setMaximized(value);
      });
    };
    sync();
    const unlisten = win.onResized(sync);
    return () => {
      cancelled = true;
      void unlisten.then((fn) => fn());
    };
  }, []);

  if (!IS_TAURI) return null;

  const base =
    "inline-flex h-full w-[46px] items-center justify-center text-muted-foreground transition-colors cursor-pointer hover:bg-muted hover:text-foreground";

  return (
    <div
      data-tauri-drag-region="false"
      className="absolute top-0 right-0 z-30 flex h-full items-stretch"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label={t("header.minimize")}
        title={t("header.minimize")}
        className={base}
        onClick={() => void runWindowAction("minimize")}
      >
        <Minus className="size-4" strokeWidth={2} />
      </button>
      <button
        type="button"
        aria-label={maximized ? t("header.restore") : t("header.maximize")}
        title={maximized ? t("header.restore") : t("header.maximize")}
        className={base}
        onClick={() => void runWindowAction("toggleMaximize")}
      >
        {maximized ? (
          <Copy className="size-3.5 -scale-x-100" strokeWidth={2} />
        ) : (
          <Square className="size-3.5" strokeWidth={2} />
        )}
      </button>
      <button
        type="button"
        aria-label={t("header.close")}
        title={t("header.close")}
        className={cn(base, "hover:bg-destructive hover:text-white")}
        onClick={() => void runWindowAction("close")}
      >
        <X className="size-4" strokeWidth={2} />
      </button>
    </div>
  );
}
