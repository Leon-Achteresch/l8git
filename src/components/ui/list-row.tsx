import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const listRowVariants = cva(
  "group/list-row relative flex w-full min-w-0 shrink-0 items-center gap-2 rounded-md text-left transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "rounded-lg text-muted-foreground hover:bg-muted/70 hover:text-foreground data-[active=true]:bg-muted data-[active=true]:font-medium data-[active=true]:text-foreground",
        accent:
          "text-muted-foreground hover:bg-muted hover:text-foreground data-[active=true]:bg-primary/10 data-[active=true]:font-medium data-[active=true]:text-primary",
        ghost: "text-muted-foreground hover:text-foreground",
        card: "rounded-xl border border-border/60 bg-muted/20 text-muted-foreground shadow-xs hover:border-border hover:bg-muted/40 hover:text-foreground data-[active=true]:border-primary/40 data-[active=true]:bg-primary/5 data-[active=true]:text-foreground data-[active=true]:shadow-sm",
      },
      size: {
        xs: "min-h-6 px-1.5 py-0.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-7 px-2 py-1 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        default: "min-h-8 px-2.5 py-1.5 text-sm [&_svg:not([class*='size-'])]:size-4",
        lg: "min-h-10 px-3 py-2 text-sm [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function ListRow({
  className,
  variant,
  size,
  asChild = false,
  active,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof listRowVariants> & {
    asChild?: boolean;
    active?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="list-row"
      data-active={active ? "true" : undefined}
      type={asChild ? undefined : "button"}
      className={cn(listRowVariants({ variant, size }), className)}
      {...props}
    />
  );
}

function ListRowLabel({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="list-row-label"
      className={cn("min-w-0 flex-1 truncate", className)}
      {...props}
    />
  );
}

function ListRowMeta({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="list-row-meta"
      className={cn(
        "ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { ListRow, ListRowLabel, ListRowMeta, listRowVariants };
