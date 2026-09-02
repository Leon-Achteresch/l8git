import { ChevronDown } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SPRING_PRESS } from "@/lib/motion/ease";

function isMenuChoice(target: EventTarget | null): boolean {
  return target instanceof Element
    && Boolean(target.closest("[data-slot='dropdown-menu-radio-item']"));
}

function isAgentPrompt(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-agent-prompt]"));
}

function focusAgentPrompt() {
  document.querySelector<HTMLElement>("[data-agent-prompt]")?.focus({ preventScroll: true });
}

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
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeForPrompt = (event: Event) => {
      if (!isAgentPrompt(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("focusin", closeForPrompt);
    document.addEventListener("pointerdown", closeForPrompt, true);
    document.addEventListener("keydown", closeForPrompt, true);
    return () => {
      document.removeEventListener("focusin", closeForPrompt);
      document.removeEventListener("pointerdown", closeForPrompt, true);
      document.removeEventListener("keydown", closeForPrompt, true);
    };
  }, [open]);

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <m.button
          type="button"
          className="ag-chip"
          title={title}
          aria-label={title}
          aria-haspopup="menu"
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
        side="bottom"
        sideOffset={8}
        avoidCollisions={false}
        className="ag-menu w-60 p-1.5"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onClick={(event) => {
          if (!isMenuChoice(event.target)) return;
          setOpen(false);
          requestAnimationFrame(focusAgentPrompt);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            requestAnimationFrame(focusAgentPrompt);
            return;
          }
          if (event.key !== "Enter" && event.key !== " ") return;
          if (isMenuChoice(event.target)) {
            requestAnimationFrame(() => {
              setOpen(false);
              focusAgentPrompt();
            });
          }
        }}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
