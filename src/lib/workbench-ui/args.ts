import type { CommandSpec } from "@/lib/git-expansion";

/** Shell-free argv split: whitespace separates, single/double quotes group, backslash escapes. */
export function splitArgs(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let has = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && i + 1 < line.length) cur += line[++i];
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (c === "\\" && i + 1 < line.length) {
      cur += line[++i];
      has = true;
    } else if (/\s/.test(c)) {
      if (has || cur) out.push(cur);
      cur = "";
      has = false;
    } else {
      cur += c;
    }
  }
  if (quote) throw new Error("Unclosed quote");
  if (has || cur) out.push(cur);
  return out;
}

/** `npm test -- --run` → CommandSpec; null when empty or malformed. */
export function toCommand(line: string, timeoutSeconds: number): CommandSpec | null {
  let argv: string[];
  try {
    argv = splitArgs(line.trim());
  } catch {
    return null;
  }
  if (!argv.length || !Number.isFinite(timeoutSeconds) || timeoutSeconds < 1) return null;
  return { program: argv[0], args: argv.slice(1), timeoutSeconds: Math.min(Math.round(timeoutSeconds), 3600) };
}

export const commandLine = (c: CommandSpec) =>
  [c.program, ...c.args].map((a) => (/[\s"'\\]/.test(a) || !a ? JSON.stringify(a) : a)).join(" ");
