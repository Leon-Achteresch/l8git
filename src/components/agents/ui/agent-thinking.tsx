import { ChevronDown } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const DOTS = [0, 1, 2, 3].flatMap(x => [0, 1, 2].map(y => [x, y] as const));

export function AgentThinking({
  label = "Thinking",
  seconds,
  className,
}: {
  label?: string;
  seconds?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (seconds !== undefined) return;
    const start = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - start) / 1000), 100);
    return () => clearInterval(id);
  }, [seconds]);

  const value = seconds ?? elapsed;

  return (
    <span
      role="status"
      className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground", className)}
    >
      <svg width="14" height="11" viewBox="0 0 14 11" aria-hidden className="shrink-0">
        {DOTS.map(([x, y], i) => (
          <m.circle
            key={`${x}-${y}`}
            cx={1.5 + x * 3.6}
            cy={1.5 + y * 3.6}
            r="1"
            fill="currentColor"
            animate={reduce ? undefined : { opacity: [0.25, 1, 0.25] }}
            transition={reduce ? undefined : { repeat: Infinity, duration: 1.6, delay: i * 0.06 }}
            opacity={0.5}
          />
        ))}
      </svg>
      <m.span
        animate={reduce ? undefined : { opacity: [0.55, 1, 0.55] }}
        transition={reduce ? undefined : { repeat: Infinity, duration: 1.6 }}
      >
        {label}
      </m.span>
      <span aria-hidden className="tabular-nums">{value.toFixed(1)}s</span>
    </span>
  );
}

export function AgentThinkingBlock({
  text,
  redacted,
  completed,
  defaultOpen = false,
  className,
}: {
  text: string;
  redacted?: boolean;
  completed?: boolean;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details open={defaultOpen} className={cn("group text-sm", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-muted-foreground marker:hidden">
        <span className="text-foreground">{redacted ? "Geschützter Gedankengang" : "Thinking"}</span>
        {!completed ? <AgentThinking label="" seconds={undefined} className="gap-1" /> : null}
        <ChevronDown
          className="ml-auto size-3.5 shrink-0 transition-transform duration-150 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      {redacted ? (
        <p className="mt-1 text-muted-foreground italic">Inhalt nicht verfügbar (redacted).</p>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{text}</p>
      )}
    </details>
  );
}
