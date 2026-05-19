import { MagicPill } from "@/components/motion/magic-pill";
import type { TabDisplayMode, TabLayout, TabSize } from "@/lib/sidebar-prefs";
import { cn } from "@/lib/utils";

interface SidebarNavItemProps {
  isActive: boolean;
  icon?: React.ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
  displayMode?: TabDisplayMode;
  tabSize?: TabSize;
  tabLayout?: TabLayout;
}

export function SidebarNavItem({
  isActive,
  icon,
  label,
  count,
  onClick,
  displayMode = "full",
  tabSize = "normal",
  tabLayout = "list",
}: SidebarNavItemProps) {
  const hasCount = count != null && count > 0;
  const showIcon = icon != null && displayMode !== "labels_only";
  const showLabel = displayMode !== "icons_only";

  /* ── Grid layout ──────────────────────────────────────────────────────── */
  if (tabLayout === "grid") {
    const gridHeightClass = {
      compact: "h-12",
      normal: "h-14",
      large: "h-16",
    }[tabSize];

    return (
      <button
        type="button"
        role="tab"
        aria-selected={isActive}
        title={!showLabel ? label : undefined}
        onClick={onClick}
        className={cn(
          "group relative flex w-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md px-1 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/60",
          gridHeightClass,
          isActive
            ? "bg-sidebar-accent/80 text-sidebar-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-sidebar-accent/40 hover:text-foreground",
        )}
      >
        {isActive && (
          <MagicPill
            layoutId="sidebar-tab-pill"
            className="pointer-events-none absolute inset-x-[18%] top-0 h-[2px] rounded-full bg-primary"
          />
        )}

        {showIcon ? (
          <span
            className={cn(
              "relative shrink-0 transition-colors",
              isActive ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {icon}
          </span>
        ) : null}

        {showLabel && (
          <span className="max-w-full truncate text-center text-[10px] leading-tight">
            {label}
          </span>
        )}

        {/* Corner count badge (always corner-style in grid mode) */}
        {hasCount && (
          <span className="pointer-events-none absolute right-0.5 top-0.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold tabular-nums text-primary-foreground">
            {count! > 9 ? "9+" : count}
          </span>
        )}
      </button>
    );
  }

  /* ── List layout (original) ───────────────────────────────────────────── */
  const heightClass = {
    compact: "h-7",
    normal: "h-8",
    large: "h-10",
  }[tabSize];

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      title={!showLabel ? label : undefined}
      onClick={onClick}
      className={cn(
        "group relative flex w-full items-center overflow-hidden rounded-md outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/60",
        heightClass,
        displayMode === "icons_only"
          ? "justify-center px-1"
          : "gap-2 pl-2.5 pr-2 text-[13px]",
        isActive
          ? "bg-sidebar-accent/80 text-sidebar-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-sidebar-accent/40 hover:text-foreground",
      )}
    >
      {isActive && (
        <MagicPill
          layoutId="sidebar-tab-pill"
          className="pointer-events-none absolute inset-y-[18%] left-0 w-[2px] rounded-full bg-primary"
        />
      )}

      {showIcon ? (
        <span
          className={cn(
            "relative shrink-0 transition-colors",
            isActive ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {icon}
        </span>
      ) : null}

      {showLabel && (
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      )}

      {/* Count badge for label-visible modes */}
      {hasCount && showLabel && (
        <span
          className={cn(
            "ml-auto flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-md px-1 text-[10px] font-semibold tabular-nums transition-colors",
            isActive
              ? "bg-primary/20 text-primary"
              : "bg-muted/70 text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary",
          )}
        >
          {count! > 99 ? "99+" : count}
        </span>
      )}

      {/* Compact count badge for icons-only mode */}
      {hasCount && !showLabel && (
        <span className="pointer-events-none absolute right-0.5 top-0.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold tabular-nums text-primary-foreground">
          {count! > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}
