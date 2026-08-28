import { useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useIslandStore } from "@/lib/island-store";

export function IslandPanel({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const size = useIslandStore((s) => s.panelSize);
  const setPanelSize = useIslandStore((s) => s.setPanelSize);
  const origin = useRef<{ x: number; y: number; width: number; height: number } | null>(
    null,
  );

  return (
    <div
      className="relative flex flex-col"
      style={{ width: size.width, height: size.height }}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
      <span
        data-no-drag
        role="separator"
        aria-label={t("island.resize")}
        className="absolute bottom-0 right-0 z-10 size-5 cursor-nwse-resize touch-none"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          origin.current = {
            x: e.clientX,
            y: e.clientY,
            width: size.width,
            height: size.height,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const start = origin.current;
          if (!start) return;
          setPanelSize({
            width: start.width + e.clientX - start.x,
            height: start.height + e.clientY - start.y,
          });
        }}
        onPointerUp={() => {
          origin.current = null;
        }}
        onPointerCancel={() => {
          origin.current = null;
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1.5 right-1.5 size-2 border-b-2 border-r-2 border-current opacity-45"
        />
      </span>
    </div>
  );
}
