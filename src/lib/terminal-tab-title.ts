const OUTPUT_TAIL = 1200;
const TITLE_MAX = 40;

export function repoDefaultTabTitle(repoPath: string, branch?: string): string {
  const name = repoPath.split(/[/\\]/).filter(Boolean).pop();
  if (branch?.trim()) return branch.trim();
  return name ?? "Terminal";
}

export function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "");
}

function truncate(s: string, max = TITLE_MAX): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function folderNameFromPath(p: string): string {
  const cleaned = p.replace(/[/\\]+$/, "");
  const parts = cleaned.split(/[/\\]/).filter(Boolean);
  if (parts.length === 0) return p || "~";
  return parts[parts.length - 1];
}

export function titleFromCommandLine(line: string): string | null {
  const cmd = line.trim();
  if (!cmd) return null;
  const first = cmd.split(/\s+/)[0];
  if (first === "clear" || first === "reset") return null;
  if (cmd.startsWith("cd ")) {
    const target = cmd
      .slice(3)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (target) return folderNameFromPath(target);
  }
  return truncate(cmd);
}

function cwdFromPromptLine(line: string): string | null {
  const ps = line.match(/PS\s+(.+?)>\s*$/i);
  if (ps) return folderNameFromPath(ps[1].trim());

  const zshArrow = line.match(/(?:➜|❯)\s+(.+?)\s*$/);
  if (zshArrow) return folderNameFromPath(zshArrow[1].trim());

  const bashColon = line.match(/:([^:$#]+)[$#]\s*$/);
  if (bashColon) return folderNameFromPath(bashColon[1].trim());

  const suffix = line.match(/([^\s]+)\s*[$%#>]\s*$/);
  if (suffix) {
    const segment = suffix[1];
    if (/[/\\~]/.test(segment) || /^[A-Za-z]:/.test(segment))
      return folderNameFromPath(segment);
    return segment;
  }

  const fish = line.match(/^([^\s>]+)>\s*$/);
  if (fish) return folderNameFromPath(fish[1]);

  return null;
}

export function titleFromTerminalOutput(raw: string): string | null {
  const tail = stripAnsi(raw).slice(-OUTPUT_TAIL);
  const lines = tail.split("\n").map((l) => l.trimEnd()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 4; i--) {
    const cwd = cwdFromPromptLine(lines[i]);
    if (cwd) return cwd;
  }
  return null;
}

export class TerminalInputTracker {
  private buffer = "";

  feed(data: string): string | null {
    for (const ch of data) {
      if (ch === "\r" || ch === "\n") {
        const line = this.buffer;
        this.buffer = "";
        return titleFromCommandLine(line);
      }
      if (ch === "\x7f" || ch === "\b") {
        this.buffer = this.buffer.slice(0, -1);
      } else if (ch === "\x03") {
        this.buffer = "";
      } else if (ch === "\t" || (ch >= " " && ch <= "~")) {
        this.buffer += ch;
      }
    }
    return null;
  }
}
