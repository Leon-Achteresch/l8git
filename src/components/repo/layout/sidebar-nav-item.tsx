import { MagicPill } from "@/components/motion/magic-pill";
import { cn } from "@/lib/utils";

interface SidebarNavItemProps {
  isActive: boolean;
  icon: React.ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
}

export function SidebarNavItem({
  isActive,
  icon,
  label,
  count,
  onClick,
}: SidebarNavItemProps) {
  const hasCount = count != null && count > 0;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      title={label}
      onClick={onClick}
      className={cn(
        "group relative flex h-8 w-full items-center gap-2 overflow-hidden rounded-md pl-2.5 pr-2 text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/60",
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

      <span
        className={cn(
          "relative shrink-0 transition-colors",
          isActive ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {icon}
      </span>

      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {hasCount && (
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
    </button>
  );
}
