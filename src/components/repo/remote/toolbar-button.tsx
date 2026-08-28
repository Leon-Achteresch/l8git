import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PopIn } from "@/components/motion/pop-in";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { ReactNode } from "react";

interface ToolbarButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  label?: string;
  icon: ReactNode;
  isActive?: boolean;
  badge?: number;
  warnDot?: boolean;
  menuContent?: ReactNode;
  menuAriaLabel?: string;
}

export function ToolbarButton({
  onClick,
  disabled,
  title,
  label,
  icon,
  isActive,
  badge,
  warnDot,
  menuContent,
  menuAriaLabel,
}: ToolbarButtonProps) {
  const showBadge = typeof badge === "number" && badge > 0;
  const button = (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "relative flex h-7 min-w-0 shrink items-center gap-1.5 px-2 text-xs transition-all duration-200",
        menuContent ? "rounded-l-lg rounded-r-none" : "rounded-lg",
        label ? "px-2.5" : "px-2",
        isActive
          ? "bg-primary/15 text-primary shadow-sm ring-1 ring-primary/20"
          : "text-muted-foreground hover:bg-primary/10 hover:text-primary",
      )}
    >
      {warnDot && (
        <PopIn className="absolute right-1 top-1">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-git-modified" />
        </PopIn>
      )}
      {icon}
      {label && <span className="truncate">{label}</span>}
      {showBadge && (
        <PopIn key={badge} className="shrink-0">
          <span className="inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary/25 px-1 text-[10px] font-semibold tabular-nums leading-none text-primary">
            {badge > 99 ? "99+" : badge}
          </span>
        </PopIn>
      )}
    </Button>
  );

  if (!menuContent) return button;

  return (
    <div className="flex min-w-0 items-stretch">
      {button}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            aria-label={menuAriaLabel ?? title}
            className={cn(
              "h-7 w-4 min-w-0 shrink-0 rounded-l-none rounded-r-lg border-l border-border/40 px-0 transition-all duration-200",
              isActive
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-primary/10 hover:text-primary",
            )}
          >
            <ChevronDown className="size-3 transition-transform duration-200 in-data-[state=open]:rotate-180" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          {menuContent}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
