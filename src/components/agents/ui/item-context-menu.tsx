import type { ReactNode } from "react";
import { toast } from "sonner";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export type MenuEntry =
  | "separator"
  | {
      label: string;
      icon: ReactNode;
      destructive?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    };

export function copyToClipboard(value: string, success: string) {
  void navigator.clipboard
    ?.writeText(value)
    .then(() => toast.success(success))
    .catch((error: unknown) => toast.error(error instanceof Error ? error.message : String(error)));
}

export function ItemContextMenu({
  entries,
  children,
}: {
  entries: MenuEntry[];
  children: ReactNode;
}) {
  if (entries.length === 0) return <>{children}</>;
  return (
    <ContextMenu>
      <ContextMenuTrigger className="block w-full select-text">{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {entries.map((entry, index) =>
          entry === "separator" ? (
            <ContextMenuSeparator key={`separator-${index}`} />
          ) : (
            <ContextMenuItem
              key={entry.label}
              variant={entry.destructive ? "destructive" : "default"}
              disabled={entry.disabled}
              onSelect={entry.onSelect}
            >
              {entry.icon}
              {entry.label}
            </ContextMenuItem>
          ),
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
