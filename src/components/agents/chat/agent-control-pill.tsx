import { ChevronDown } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SPRING_PRESS } from "@/lib/motion/ease";

export function AgentControlPill({
  icon,
  label,
  title,
  tone = "default",
  children,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  tone?: "default" | "warning";
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <m.button
          type="button"
          className="ag-chip"
          title={title}
          aria-label={title}
          whileTap={reduce ? undefined : { scale: 0.97 }}
          transition={SPRING_PRESS}
        >
          <span
            className={`grid size-3.5 shrink-0 place-items-center ${
              tone === "warning" ? "text-[var(--destructive)]" : ""
            } [&_svg]:size-3.5`}
          >
            {icon}
          </span>
          <span className="max-w-32 truncate">{label}</span>
          <ChevronDown className="ag-faint size-3 shrink-0" />
        </m.button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={8}
        className="ag-menu w-60 p-1.5"
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
