import { Button } from "@/components/ui/button";
import { SPRING_LAYOUT } from "@/lib/motion/ease";
import type { TerminalPosition } from "@/lib/terminal-store";
import { cn } from "@/lib/utils";
import { PanelBottom, PanelRight } from "lucide-react";
import { m } from "motion/react";

interface Props {
  position: TerminalPosition;
  onChange: (position: TerminalPosition) => void;
  dockBottomLabel: string;
  dockRightLabel: string;
}

export function TerminalDockToggle({
  position,
  onChange,
  dockBottomLabel,
  dockRightLabel,
}: Props) {
  return (
    <div
      className="relative flex h-7 items-center rounded-full bg-foreground/[0.05] p-0.5 ring-1 ring-border/50"
      role="group"
    >
      {(
        [
          {
            id: "bottom" as const,
            label: dockBottomLabel,
            Icon: PanelBottom,
          },
          {
            id: "right" as const,
            label: dockRightLabel,
            Icon: PanelRight,
          },
        ] as const
      ).map(({ id, label, Icon }) => {
        const active = position === id;
        return (
          <Button
            key={id}
            type="button"
            variant="ghost"
            size="icon-xs"
            title={label}
            aria-pressed={active}
            onClick={() => onChange(id)}
            className={cn(
              "relative size-6 rounded-full transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <m.span
                layoutId="terminal-dock-pill"
                className="absolute inset-0 rounded-full bg-background shadow-sm ring-1 ring-border/60"
                transition={SPRING_LAYOUT}
                aria-hidden
              />
            )}
            <Icon className="relative size-3.5" />
          </Button>
        );
      })}
    </div>
  );
}
