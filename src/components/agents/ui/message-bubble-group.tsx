import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

export interface MessageBubbleGroupProps extends ComponentPropsWithRef<"div"> {
  spacing?: "compact" | "default";
}

export function MessageBubbleGroup({
  spacing = "compact",
  className,
  ...props
}: MessageBubbleGroupProps) {
  return (
    <div
      data-slot="message-bubble-group"
      className={cn(
        "flex w-full min-w-0 flex-col",
        spacing === "compact" ? "gap-1.5" : "gap-3",
        className,
      )}
      {...props}
    />
  );
}
