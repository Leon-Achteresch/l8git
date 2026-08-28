// beui.dev/components/motion/number-ticker
//
// Per-digit odometer. Each glyph is keyed by its place value, so a changing
// digit rolls to its new face instead of remounting and replaying from zero,
// and a number that grows adds glyphs on the left without disturbing the ones
// and tens already on screen.

import { m, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import { EASE_OUT } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

const DIGIT_HEIGHT_EM = 1.1;
const DIGITS = Array.from({ length: 10 }, (_, n) => n);

export interface NumberTickerProps {
  value: number;
  /** Left-pad the formatted value to this many characters. */
  pad?: number;
  /** Per-digit roll duration, in seconds. */
  duration?: number;
  /** Entrance stagger between digits, in seconds. */
  stagger?: number;
  prefix?: string;
  suffix?: string;
  /** Custom formatter. Defaults to a locale-grouped integer. */
  format?: (value: number) => string;
  className?: string;
  digitClassName?: string;
}

export function NumberTicker({
  value,
  pad,
  duration = 0.7,
  stagger = 0.03,
  prefix,
  suffix,
  format,
  className,
  digitClassName,
}: NumberTickerProps) {
  const text = useMemo(() => {
    const rounded = Math.round(value);
    const formatted = format ? format(rounded) : rounded.toLocaleString();
    return pad ? formatted.padStart(pad, "0") : formatted;
  }, [format, pad, value]);

  const glyphs = useMemo(() => {
    const chars = text.split("");
    return chars.map((char, index) => ({ char, id: `g-${chars.length - 1 - index}` }));
  }, [text]);

  // The stagger is an entrance flourish. Once it has played, later value
  // changes roll every digit at once — a per-digit delay on live updates
  // reads as lag rather than polish.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (entered) return;
    const total = (duration + glyphs.length * stagger) * 1000;
    const timer = window.setTimeout(() => setEntered(true), total);
    return () => window.clearTimeout(timer);
  }, [duration, entered, glyphs.length, stagger]);

  const readable = `${prefix ?? ""}${text}${suffix ?? ""}`;

  return (
    <span className={cn("inline-flex items-center tabular-nums", className)}>
      <span className="sr-only">{readable}</span>
      <span aria-hidden="true" className="inline-flex items-center">
        {prefix ? <span>{prefix}</span> : null}
        {glyphs.map(({ char, id }, index) => {
          if (!/\d/.test(char)) {
            return (
              <span key={id} className="inline-block">
                {char}
              </span>
            );
          }
          return (
            <Digit
              key={id}
              digit={Number(char)}
              delay={entered ? 0 : index * stagger}
              duration={duration}
              className={digitClassName}
            />
          );
        })}
        {suffix ? <span>{suffix}</span> : null}
      </span>
    </span>
  );
}

function Digit({
  digit,
  delay,
  duration,
  className,
}: {
  digit: number;
  delay: number;
  duration: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <span
      className={cn("relative inline-block overflow-hidden", className)}
      style={{ height: `${DIGIT_HEIGHT_EM}em`, width: "1ch" }}
    >
      <m.span
        initial={{ y: 0 }}
        animate={{ y: `-${digit * DIGIT_HEIGHT_EM}em` }}
        transition={reduce ? { duration: 0 } : { duration, delay, ease: EASE_OUT }}
        className="absolute inset-x-0 top-0 flex flex-col items-center will-change-transform"
      >
        {DIGITS.map((n) => (
          <span
            key={n}
            className="flex items-center justify-center leading-none"
            style={{ height: `${DIGIT_HEIGHT_EM}em` }}
          >
            {n}
          </span>
        ))}
      </m.span>
    </span>
  );
}
