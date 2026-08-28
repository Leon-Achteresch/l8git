import { ListRow } from "@/components/ui/list-row";
import { PopIn } from "@/components/motion/pop-in";
import type { TabDisplayMode, TabLayout, TabSize } from "@/lib/sidebar-prefs";
import { cn } from "@/lib/utils";

interface SidebarNavItemProps {
  isActive: boolean;
  icon?: React.ReactNode;
  label: string;
  count?: number;
  emphasis?: boolean;
  onClick: () => void;
  displayMode?: TabDisplayMode;
  tabSize?: TabSize;
  tabLayout?: TabLayout;
}

function CornerBadge({ count, emphasis }: { count: number; emphasis?: boolean }) {
  return (
    <PopIn key={count} className="pointer-events-none absolute right-0.5 top-0.5">
      <span
        className={cn(
          "flex h-[14px] min-w-[14px] items-center justify-center rounded-full px-0.5 text-[9px] font-bold tabular-nums",
          emphasis
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground ring-1 ring-border",
        )}
      >
        {count > 9 ? "9+" : count}
      </span>
    </PopIn>
  );
}

export function SidebarNavItem({
  isActive,
  icon,
  label,
  count,
  emphasis,
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
      <ListRow
        role="tab"
        aria-selected={isActive}
        active={isActive}
        title={!showLabel ? label : undefined}
        onClick={onClick}
        className={cn(
          "group flex-col justify-center gap-0.5 overflow-hidden px-1 active:scale-[0.97]",
          gridHeightClass,
          "rounded-lg hover:bg-sidebar-accent/50 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
        )}
      >
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

        {hasCount && <CornerBadge count={count!} emphasis={emphasis} />}
      </ListRow>
    );
  }

  /* ── List layout (original) ───────────────────────────────────────────── */
  const heightClass = {
    compact: "h-7",
    normal: "h-8",
    large: "h-10",
  }[tabSize];

  return (
    <ListRow
      role="tab"
      aria-selected={isActive}
      active={isActive}
      title={!showLabel ? label : undefined}
      onClick={onClick}
      className={cn(
        "group overflow-hidden active:scale-[0.98]",
        heightClass,
        displayMode === "icons_only"
          ? "justify-center px-1"
          : "gap-2 pl-2.5 pr-2 text-[13px]",
        "rounded-lg hover:bg-sidebar-accent/50 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
      )}
    >

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

      {hasCount && showLabel && (
        <PopIn key={count} className="ml-auto shrink-0">
          <span
            className={cn(
              "flex h-[18px] min-w-[18px] items-center justify-center rounded-md px-1 text-[10px] font-semibold tabular-nums transition-colors",
              emphasis
                ? "bg-primary text-primary-foreground"
                : isActive
                  ? "bg-primary/20 text-primary"
                  : "bg-muted/70 text-muted-foreground",
            )}
          >
            {count! > 99 ? "99+" : count}
          </span>
        </PopIn>
      )}

      {hasCount && !showLabel && <CornerBadge count={count!} emphasis={emphasis} />}
    </ListRow>
  );
}
