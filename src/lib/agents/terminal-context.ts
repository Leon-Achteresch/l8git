import { looksSecretKey } from "@/lib/agents/plugins/content";

const ANSI_ESCAPE_PATTERN =
  // eslint-disable-next-line no-control-regex
  /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\r/g;

const SECRET_ASSIGNMENT_PATTERN = /([A-Za-z0-9_.-]+)\s*[:=]\s*("[^"]*"|'[^']*'|\S+)/g;

export interface TerminalContextInput {
  maxLines?: number;
  maxChars?: number;
  command?: string;
  cwd?: string;
  host?: string;
}

export interface TerminalContextBlock {
  codeBlock: string;
  origin: {
    command: string | null;
    cwd: string | null;
    host: string | null;
  };
  truncated: boolean;
  droppedLines: number;
}

function stripAnsi(line: string): string {
  return line.replace(ANSI_ESCAPE_PATTERN, "");
}

function redactLine(line: string): string {
  return line.replace(SECRET_ASSIGNMENT_PATTERN, (match, key: string) =>
    looksSecretKey(key) ? `${key}=[redacted]` : match,
  );
}

export function buildTerminalContext(
  lines: readonly string[],
  options: TerminalContextInput = {},
): TerminalContextBlock {
  const maxLines = options.maxLines ?? 200;
  const maxChars = options.maxChars ?? 8000;

  const cleaned = lines.map((line) => redactLine(stripAnsi(line)));
  const droppedLines = Math.max(0, cleaned.length - maxLines);
  const clippedLines = cleaned.slice(Math.max(0, cleaned.length - maxLines));

  let joined = clippedLines.join("\n");
  let truncated = droppedLines > 0;
  if (joined.length > maxChars) {
    joined = joined.slice(joined.length - maxChars);
    truncated = true;
  }

  const codeBlock = `\`\`\`\n${joined}\n\`\`\``;

  return {
    codeBlock,
    origin: {
      command: options.command !== undefined ? redactLine(options.command) : null,
      cwd: options.cwd ?? null,
      host: options.host ?? null,
    },
    truncated,
    droppedLines,
  };
}
