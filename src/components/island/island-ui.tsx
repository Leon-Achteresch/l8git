import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  XCircle,
} from "lucide-react";
import { m } from "motion/react";
import type { ReactNode } from "react";

import { SpinIcon } from "@/components/motion/kit";
import { cn } from "@/lib/utils";

/** The island paints on `bg-foreground`, so rows tint with the background color. */
export const ISLAND_ROW =
  "text-current hover:bg-background/10 hover:text-current data-[active=true]:bg-background/15 data-[active=true]:text-current";
export const ISLAND_ICON =
  "text-current opacity-60 hover:bg-background/10 hover:text-current hover:opacity-100";

export const ISLAND_VIEW = {
  projects: "projects",
  menu: "menu",
  toast: "toast",
  agent: "agent",
  chat: "chat",
  actions: "actions",
} as const;

export type IslandFlashType = "success" | "error" | "warning" | "info" | "loading";

/** One transient line the island shows in place of the pill. */
export type IslandFlash = {
  id: string;
  type: IslandFlashType;
  title: ReactNode;
  description?: ReactNode;
  onDismiss?: () => void;
};

export function FlashIcon({ type }: { type?: IslandFlashType }) {
  const className = "size-4 shrink-0";
  if (type === "success")
    return <CheckCircle2 className={cn(className, "text-git-added")} />;
  if (type === "error")
    return <XCircle className={cn(className, "text-git-removed")} />;
  if (type === "warning")
    return <AlertTriangle className={cn(className, "text-git-modified")} />;
  if (type === "loading")
    return <SpinIcon icon={Loader2} className={cn(className, "opacity-70")} />;
  return <Info className={cn(className, "opacity-70")} />;
}

export function ActivityBars({ className }: { className?: string }) {
  return (
    <span
      className={cn("flex h-3 shrink-0 items-end gap-[2px]", className)}
      aria-hidden
    >
      {[0, 1, 2].map((i) => (
        <m.span
          key={i}
          className="w-[2px] rounded-full bg-current"
          animate={{ height: ["30%", "100%", "30%"], opacity: [0.55, 1, 0.55] }}
          transition={{
            repeat: Infinity,
            duration: 0.9,
            ease: "easeInOut",
            delay: i * 0.15,
          }}
        />
      ))}
    </span>
  );
}
