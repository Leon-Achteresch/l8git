import { Check } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useState } from "react";

import { Collapse } from "@/components/motion/kit";
import { SPRING_PANEL, SPRING_PRESS, SPRING_SWAP } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export type AgentQuestionOption = { label: string; description?: string };

export function AgentQuestionCard({
  header,
  question,
  options,
  multiSelect = false,
  allowOther = true,
  otherLabel = "Other",
  submitLabel = "Submit",
  onSubmit,
  className,
}: {
  header?: string;
  question: string;
  options: AgentQuestionOption[];
  multiSelect?: boolean;
  allowOther?: boolean;
  otherLabel?: string;
  submitLabel?: string;
  onSubmit?: (labels: string[]) => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState<string[]>([]);
  const [otherOpen, setOtherOpen] = useState(false);
  const [other, setOther] = useState("");

  const answers = [...selected, ...(otherOpen && other.trim() ? [other.trim()] : [])];

  const toggle = (label: string) => {
    if (!multiSelect) {
      setOtherOpen(false);
      setSelected([label]);
      onSubmit?.([label]);
      return;
    }
    setSelected(current =>
      current.includes(label) ? current.filter(item => item !== label) : [...current, label],
    );
  };

  const toggleOther = () => {
    setOtherOpen(open => !open);
    if (!multiSelect) setSelected([]);
  };

  return (
    <m.div
      className={cn("w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-sm", className)}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_PANEL}
    >
      {header && (
        <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{header}</span>
      )}
      <p className={cn("text-sm font-medium", header && "mt-2")}>{question}</p>

      <div role={multiSelect ? "group" : "radiogroup"} aria-label={question} className="mt-3 flex flex-col gap-1">
        {options.map((option, index) => {
          const active = selected.includes(option.label);
          return (
            <m.button
              key={option.label}
              type="button"
              role={multiSelect ? "checkbox" : "radio"}
              aria-checked={active}
              onClick={() => toggle(option.label)}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING_PANEL, delay: reduce ? 0 : Math.min(index, 8) * 0.03 }}
              whileTap={reduce ? undefined : { scale: 0.98 }}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border px-3 py-2 text-left",
                active ? "border-border bg-muted/60" : "border-transparent hover:bg-muted/40",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center border text-background",
                  multiSelect ? "rounded-sm" : "rounded-full",
                  active ? "border-foreground bg-foreground" : "border-muted-foreground/50",
                )}
              >
                <AnimatePresence>
                  {active && (
                    <m.span
                      key="check"
                      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                      transition={SPRING_SWAP}
                      className="grid place-items-center"
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </m.span>
                  )}
                </AnimatePresence>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{option.label}</span>
                {option.description && (
                  <span className="block text-xs text-muted-foreground">{option.description}</span>
                )}
              </span>
            </m.button>
          );
        })}

        {allowOther && (
          <div
            className={cn(
              "rounded-xl border",
              otherOpen ? "border-border bg-muted/60" : "border-transparent hover:bg-muted/40",
            )}
          >
            <button
              type="button"
              role={multiSelect ? "checkbox" : "radio"}
              aria-checked={otherOpen}
              onClick={toggleOther}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-4 shrink-0 place-items-center border text-background",
                  multiSelect ? "rounded-sm" : "rounded-full",
                  otherOpen ? "border-foreground bg-foreground" : "border-muted-foreground/50",
                )}
              >
                <AnimatePresence>
                  {otherOpen && (
                    <m.span
                      key="other-check"
                      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                      transition={SPRING_SWAP}
                      className="grid place-items-center"
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </m.span>
                  )}
                </AnimatePresence>
              </span>
              <span className="text-sm">{otherLabel}</span>
            </button>
            <Collapse open={otherOpen}>
              <input
                autoFocus
                value={other}
                onChange={event => setOther(event.target.value)}
                onKeyDown={event => {
                  if (event.key !== "Enter" || multiSelect || !other.trim()) return;
                  event.preventDefault();
                  onSubmit?.([other.trim()]);
                }}
                placeholder="Type your answer"
                aria-label={otherLabel}
                className="w-full rounded-b-xl border-t border-border/60 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
            </Collapse>
          </div>
        )}
      </div>

      {multiSelect && (
        <m.button
          type="button"
          disabled={answers.length === 0}
          onClick={() => onSubmit?.(answers)}
          whileTap={reduce || answers.length === 0 ? undefined : { scale: 0.98 }}
          transition={SPRING_PRESS}
          className="mt-3 inline-flex h-8 w-full items-center justify-center rounded-full bg-primary text-sm text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {submitLabel}
        </m.button>
      )}
    </m.div>
  );
}
