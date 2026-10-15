import { type CSSProperties, type ReactNode } from "react";

import { WindowControls } from "@/components/app/window-controls";
import { cn } from "@/lib/utils";

export const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

export const IS_WINDOWS =
  typeof navigator !== "undefined" && /Win/i.test(navigator.platform);

export const DRAG = { WebkitAppRegion: "drag" } as CSSProperties;
export const NO_DRAG = { WebkitAppRegion: "no-drag" } as CSSProperties;

/** Draggable title bar strip. It owns the Windows caption buttons, so it must touch the window's right edge. */
export function ShellTopBar({
  macInset = false,
  className,
  children,
}: {
  /** Leave room for the macOS traffic lights when the bar starts at the window's left edge. */
  macInset?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <header
      data-tauri-drag-region
      style={DRAG}
      className={cn(
        "relative z-10 flex shrink-0 select-none items-center border-b border-border/50 bg-sidebar",
        className,
        macInset && IS_MAC && "pl-[86px]",
        IS_WINDOWS && "pr-[140px]",
      )}
    >
      {children}
      {IS_WINDOWS && <WindowControls />}
    </header>
  );
}

/** Spacer that keeps rail/sidebar content clear of the macOS traffic lights. */
export function MacTrafficLightSpacer({ className }: { className?: string }) {
  return (
    <div
      data-tauri-drag-region
      style={DRAG}
      className={cn("w-full shrink-0", IS_MAC ? "h-12" : "h-2", className)}
    />
  );
}

export function ShellDivider({ vertical = false }: { vertical?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "shrink-0 rounded-full bg-border/70",
        vertical ? "mx-1 h-4 w-px" : "my-1 h-px w-6",
      )}
    />
  );
}
