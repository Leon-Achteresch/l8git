import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useState } from "react";

import { ComposerMenu, ComposerMenuLabel } from "./composer-menu";
import type { ComposerPermission } from "./types";
import { SPRING_PRESS, SPRING_SWAP } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export function ComposerPermissionMenu({
  permissions,
  value,
  onChange,
}: {
  permissions: ComposerPermission[];
  value: string;
  onChange: (id: string) => void;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const active = permissions.find(p => p.id === value) ?? permissions[0];

  return (
    <ComposerMenu
      open={open}
      onOpenChange={setOpen}
      className="w-72"
      trigger={
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-muted"
        >
          <active.icon className="size-4" strokeWidth={1.75} aria-hidden />
          {active.label}
        </button>
      }
    >
      <ComposerMenuLabel>Permissions</ComposerMenuLabel>
      {permissions.map(permission => (
        <m.button
          key={permission.id}
          type="button"
          onClick={() => {
            onChange(permission.id);
            setOpen(false);
          }}
          whileTap={reduce ? undefined : { scale: 0.98 }}
          transition={SPRING_PRESS}
          className={cn(
            "flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-muted",
            permission.id === value && "bg-muted",
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <m.span
              key={permission.id === value ? "on" : "off"}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={SPRING_SWAP}
              className="mt-0.5 inline-flex"
            >
              <permission.icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            </m.span>
          </AnimatePresence>
          <span className="min-w-0">
            <span className="block text-sm font-medium">{permission.label}</span>
            <span className="block text-xs text-muted-foreground">{permission.hint}</span>
          </span>
        </m.button>
      ))}
    </ComposerMenu>
  );
}
