import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

interface ToolbarButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  label?: string;
  icon: ReactNode;
  isActive?: boolean;
  badge?: number;
}

export function ToolbarButton({
  onClick,
  disabled,
  title,
  label,
  icon,
  isActive,
  badge,
}: ToolbarButtonProps) {
  const showBadge = typeof badge === "number" && badge > 0;
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-all duration-200 ${
        isActive
          ? "bg-primary/15 text-primary shadow-sm ring-1 ring-primary/20"
          : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
      }`}
    >
      {icon}
      {label && <span>{label}</span>}
      {showBadge && (
        <span className="inline-flex min-h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary/25 px-1 text-[10px] font-semibold tabular-nums leading-none text-primary">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Button>
  );
}
