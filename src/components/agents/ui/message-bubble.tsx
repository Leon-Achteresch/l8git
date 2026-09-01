"use client";

import {
  type HTMLMotionProps,
  m,
  useReducedMotion,
} from "motion/react";
import {
  type ReactNode,
  useContext,
} from "react";
import { MessageSideContext } from "@/components/agents/ui/message-context";
import {
  MessageBubbleContext,
  type MessageBubbleAlign,
  type MessageBubbleVariant,
} from "@/components/agents/ui/message-bubble-context";
import {
  MessageBubbleContent,
  type MessageBubbleContentProps,
} from "@/components/agents/ui/message-bubble-content";
import {
  MessageBubbleGroup,
  type MessageBubbleGroupProps,
} from "@/components/agents/ui/message-bubble-group";
import {
  MessageBubbleCollapsible,
  type MessageBubbleCollapsibleProps,
} from "@/components/agents/ui/message-bubble-collapsible";
import { SPRING_LAYOUT } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export {
  MessageBubbleContent,
  MessageBubbleGroup,
  MessageBubbleCollapsible,
};
export type {
  MessageBubbleVariant,
  MessageBubbleAlign,
  MessageBubbleContentProps,
  MessageBubbleGroupProps,
  MessageBubbleCollapsibleProps,
};

export interface MessageBubbleProps
  extends Omit<HTMLMotionProps<"div">, "children"> {
  variant?: MessageBubbleVariant;
  align?: MessageBubbleAlign;
  animateIn?: boolean;
  children?: ReactNode;
}

export function MessageBubble({
  variant = "soft",
  align,
  animateIn = false,
  className,
  children,
  initial,
  animate,
  exit,
  transition,
  layout,
  ...props
}: MessageBubbleProps) {
  const reduce = useReducedMotion() ?? false;
  const messageSide = useContext(MessageSideContext);
  const resolvedAlign = align ?? messageSide ?? "start";

  return (
    <MessageBubbleContext.Provider
      value={{ align: resolvedAlign, animateIn, variant }}
    >
      <m.div
        data-slot="message-bubble"
        data-align={resolvedAlign}
        data-variant={variant}
        layout={layout}
        initial={initial ?? false}
        animate={animate}
        exit={
          exit ??
          (reduce ? { opacity: 0 } : { opacity: 0, y: -3, scale: 0.99 })
        }
        transition={transition ?? (reduce ? { duration: 0.12 } : SPRING_LAYOUT)}
        className={cn(
          "group/bubble flex w-full flex-col",
          resolvedAlign === "end" ? "items-end" : "items-start",
          className,
        )}
        {...props}
      >
        {children}
      </m.div>
    </MessageBubbleContext.Provider>
  );
}
