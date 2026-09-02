import { m, useReducedMotion } from "motion/react";
import {
  cloneElement,
  type ComponentPropsWithRef,
  type ReactElement,
  type Ref,
  useCallback,
  useContext,
  useState,
} from "react";
import {
  MessageBubbleContext,
  MessageBubbleLayoutContext,
  type MessageBubbleAlign,
  type MessageBubbleVariant,
} from "@/components/agents/ui/message-bubble-context";
import { EASE_OUT, SPRING_LAYOUT } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export interface MessageBubbleContentProps
  extends ComponentPropsWithRef<"div"> {
  render?: ReactElement;
}

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    }
  };
}

const BUBBLE_CONTENT_REVEAL = {
  duration: 0.12,
  ease: EASE_OUT,
  delay: 0.04,
} as const;

const BUBBLE_POP = {
  type: "spring",
  stiffness: 520,
  damping: 27,
  mass: 0.52,
} as const;

function bubbleContentClass(
  variant: MessageBubbleVariant,
  interactive: boolean,
) {
  return cn(
    "relative z-0 min-w-0 max-w-[82%] rounded-[18px] px-3.5 py-2.5 text-sm leading-6 text-[var(--ag-text)]",
    "[&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-black/10 [&_pre]:p-3 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
    variant === "solid" && "text-[var(--ag-bubble-fg)]",
    variant === "ghost" && "w-full max-w-none rounded-none px-0 py-0",
    variant === "danger" && "text-destructive",
    interactive &&
      "cursor-pointer text-left outline-none transition-[background-color,color,transform] duration-150 hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]",
  );
}

function bubbleSurfaceClass(
  variant: MessageBubbleVariant,
  align: MessageBubbleAlign,
) {
  return cn(
    "pointer-events-none absolute inset-0 -z-10 rounded-[inherit]",
    align === "end" ? "origin-bottom-right" : "origin-bottom-left",
    variant === "solid" && "bg-[var(--ag-bubble)]",
    variant === "soft" && "bg-[var(--ag-surface-2)]",
    variant === "tint" &&
      "bg-[color-mix(in_oklab,var(--git-branch)_12%,transparent)]",
    variant === "outline" &&
      "border border-[var(--ag-line)] bg-[var(--ag-surface)]",
    variant === "danger" && "bg-destructive/10",
  );
}

export function MessageBubbleContent({
  render,
  className,
  children,
  ref,
  ...props
}: MessageBubbleContentProps) {
  const reduce = useReducedMotion() ?? false;
  const { align = "start", animateIn, variant } =
    useContext(MessageBubbleContext);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const notifyLayout = useCallback(
    () => setLayoutVersion((version) => version + 1),
    [],
  );
  const interactive = render?.type === "button" || render?.type === "a";
  const classes = cn(bubbleContentClass(variant, interactive), className);
  const composedChildren = (
    <>
      {variant !== "ghost" ? (
        <m.span
          aria-hidden="true"
          layout={reduce ? false : "size"}
          layoutDependency={layoutVersion}
          initial={
            animateIn && !reduce
              ? {
                  opacity: 0,
                  scale: 0.92,
                }
              : false
          }
          animate={{ opacity: 1, scale: 1 }}
          transition={
            reduce
              ? { duration: 0 }
              : {
                  opacity: { duration: 0.12, ease: EASE_OUT },
                  scale: BUBBLE_POP,
                  layout: SPRING_LAYOUT,
                }
          }
          className={bubbleSurfaceClass(variant, align)}
        />
      ) : null}
      <MessageBubbleLayoutContext.Provider value={notifyLayout}>
        <m.div
          initial={
            animateIn
              ? reduce
                ? { opacity: 0 }
                : { opacity: 0 }
              : false
          }
          animate={{ opacity: 1 }}
          transition={
            reduce ? { duration: 0.12, ease: EASE_OUT } : BUBBLE_CONTENT_REVEAL
          }
          className="relative"
        >
          {children}
        </m.div>
      </MessageBubbleLayoutContext.Provider>
    </>
  );

  if (render) {
    const child = render as ReactElement<
      Record<string, unknown> & { className?: string; ref?: Ref<HTMLElement> }
    >;

    return cloneElement(child, {
      ...props,
      ref: mergeRefs(child.props.ref, ref as Ref<HTMLElement> | undefined),
      className: cn(classes, child.props.className),
      children: composedChildren,
      "data-slot": "message-bubble-content",
    });
  }

  return (
    <div
      ref={ref}
      data-slot="message-bubble-content"
      className={classes}
      {...props}
    >
      {composedChildren}
    </div>
  );
}
