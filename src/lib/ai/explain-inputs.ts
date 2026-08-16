import { computeReachableHashes, normalizeGitOid, DEFAULT_BRANCH_PRIORITY } from "@/lib/graph";
import type { Branch, Commit } from "@/lib/repo-store";

export const EXPLAIN_COMMIT_DIFF_BUDGET = 24_000;
export const EXPLAIN_FILE_DIFF_BUDGET = 20_000;
export const EXPLAIN_COMMIT_LIST_BUDGET = 6_000;
export const EXPLAIN_STAT_BUDGET = 4_000;
export const EXPLAIN_MAX_COMMITS = 60;
export const EXPLAIN_MAX_STAT_COMMITS = 12;
export const EXPLAIN_MAX_DIFF_FILES = 25;

export interface TruncatedText {
  text: string;
  truncated: boolean;
  omittedChars: number;
}

function truncationNote(omitted: number, total: number): string {
  return `\n\n[truncated: ${omitted} of ${total} characters omitted to fit the model budget]`;
}

export function fitDiffToBudget(diff: string, maxChars: number): TruncatedText {
  const trimmed = diff.trim();
  if (maxChars <= 0) {
    return { text: "", truncated: trimmed.length > 0, omittedChars: trimmed.length };
  }
  if (trimmed.length <= maxChars) {
    return { text: trimmed, truncated: false, omittedChars: 0 };
  }
  const slice = trimmed.slice(0, maxChars);
  const lastBreak = slice.lastIndexOf("\n");
  const kept = lastBreak > maxChars * 0.5 ? slice.slice(0, lastBreak) : slice;
  const omitted = trimmed.length - kept.length;
  return {
    text: `${kept.trimEnd()}${truncationNote(omitted, trimmed.length)}`,
    truncated: true,
    omittedChars: omitted,
  };
}

export interface FileDiffPart {
  file: string;
  diff: string;
}

export function joinFileDiffs(parts: FileDiffPart[], maxChars: number): TruncatedText {
  const usable = parts.filter((part) => part.diff.trim().length > 0);
  const sections: string[] = [];
  let used = 0;
  let omittedChars = 0;
  let omittedFiles = 0;

  for (const part of usable) {
    const head = `--- ${part.file} ---\n`;
    const body = part.diff.trim();
    const remaining = maxChars - used;
    if (remaining <= head.length + 200) {
      omittedFiles += 1;
      omittedChars += body.length;
      continue;
    }
    const fitted = fitDiffToBudget(body, remaining - head.length - 120);
    omittedChars += fitted.omittedChars;
    const section = `${head}${fitted.text}`;
    sections.push(section);
    used += section.length + 2;
  }

  const notes: string[] = [];
  if (omittedFiles > 0) notes.push(`[${omittedFiles} further changed files omitted]`);
  const text = [...sections, ...notes].join("\n\n").trim();
  return {
    text,
    truncated: omittedFiles > 0 || omittedChars > 0,
    omittedChars,
  };
}

export interface CommitHeaderParts {
  subject: string;
  body: string;
  stat: string;
}

const MESSAGE_INDENT = "    ";

export function parseCommitHeader(header: string): CommitHeaderParts {
  const lines = header.replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  while (index < lines.length && lines[index].trim() !== "") index += 1;
  index += 1;

  const messageLines: string[] = [];
  const statLines: string[] = [];
  let inStat = false;

  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith(MESSAGE_INDENT) && !inStat) {
      messageLines.push(line.slice(MESSAGE_INDENT.length));
      continue;
    }
    if (line.trim() === "") {
      if (inStat) statLines.push("");
      else messageLines.push("");
      continue;
    }
    inStat = true;
    statLines.push(line.trim());
  }

  const message = messageLines.join("\n").trim();
  const [subject = "", ...rest] = message.split("\n");
  return {
    subject: subject.trim(),
    body: rest.join("\n").trim(),
    stat: statLines.join("\n").trim(),
  };
}

export function formatCommitLine(commit: Commit): string {
  const hash = (commit.short_hash || commit.hash).slice(0, 12);
  const subject = commit.subject.trim() || "(no subject)";
  const author = commit.author.trim();
  return author ? `${hash} ${subject} — ${author}` : `${hash} ${subject}`;
}

export interface CommitListOptions {
  limit?: number;
  maxChars?: number;
}

export function formatCommitList(
  commits: Commit[],
  options: CommitListOptions = {},
): string {
  const limit = options.limit ?? EXPLAIN_MAX_COMMITS;
  const maxChars = options.maxChars ?? EXPLAIN_COMMIT_LIST_BUDGET;
  if (commits.length === 0) return "";

  const lines: string[] = [];
  let used = 0;
  let shown = 0;

  for (const commit of commits.slice(0, limit)) {
    const line = formatCommitLine(commit);
    if (used + line.length + 1 > maxChars && shown > 0) break;
    lines.push(line);
    used += line.length + 1;
    shown += 1;
  }

  const omitted = commits.length - shown;
  if (omitted > 0) lines.push(`… and ${omitted} further commits`);
  return lines.join("\n");
}

export function commitsInRange(
  commits: Commit[],
  headTip: string,
  baseTip: string | null | undefined,
  limit = EXPLAIN_MAX_COMMITS,
): Commit[] {
  const head = normalizeGitOid(headTip);
  if (!head) return [];
  const reachable = computeReachableHashes(commits, [head]);
  const baseHash = normalizeGitOid(baseTip);
  const excluded = baseHash ? computeReachableHashes(commits, [baseHash]) : new Set<string>();
  const picked: Commit[] = [];
  for (const commit of commits) {
    const hash = normalizeGitOid(commit.hash);
    if (!reachable.has(hash) || excluded.has(hash)) continue;
    picked.push(commit);
    if (picked.length >= limit) break;
  }
  return picked;
}

export interface FileStat {
  path: string;
  additions: number;
  deletions: number;
  binary?: boolean;
}

export function mergeFileStats(groups: FileStat[][]): FileStat[] {
  const merged = new Map<string, FileStat>();
  for (const group of groups) {
    for (const file of group) {
      const existing = merged.get(file.path);
      if (existing) {
        existing.additions += file.additions;
        existing.deletions += file.deletions;
        existing.binary = existing.binary || file.binary;
        continue;
      }
      merged.set(file.path, {
        path: file.path,
        additions: file.additions,
        deletions: file.deletions,
        binary: file.binary,
      });
    }
  }
  return [...merged.values()].sort((a, b) => {
    const weight = b.additions + b.deletions - (a.additions + a.deletions);
    return weight !== 0 ? weight : a.path.localeCompare(b.path);
  });
}

export interface DiffStatOptions {
  limit?: number;
  maxChars?: number;
}

export function formatDiffStat(files: FileStat[], options: DiffStatOptions = {}): string {
  if (files.length === 0) return "";
  const limit = options.limit ?? EXPLAIN_MAX_DIFF_FILES;
  const maxChars = options.maxChars ?? EXPLAIN_STAT_BUDGET;

  const lines: string[] = [];
  let used = 0;
  let shown = 0;

  for (const file of files.slice(0, limit)) {
    const line = file.binary
      ? `${file.path} | binary`
      : `${file.path} | +${file.additions} -${file.deletions}`;
    if (used + line.length + 1 > maxChars && shown > 0) break;
    lines.push(line);
    used += line.length + 1;
    shown += 1;
  }

  const omitted = files.length - shown;
  if (omitted > 0) lines.push(`… and ${omitted} further files`);

  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);
  lines.push(`${files.length} files changed, +${additions} -${deletions}`);
  return lines.join("\n");
}

export interface PrDraft {
  title: string | null;
  body: string;
}

const TITLE_LINE =
  /^\s*(?:#{1,3}\s*)?\*{0,2}\s*title\s*\*{0,2}\s*[:\-—]\s*\*{0,2}\s*(.+?)\s*\*{0,2}\s*$/i;

export function splitPrDraft(text: string): PrDraft {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const lines = normalized.split("\n");
  const firstFilled = lines.findIndex((line) => line.trim() !== "");
  if (firstFilled < 0) return { title: null, body: "" };

  const match = TITLE_LINE.exec(lines[firstFilled]);
  if (!match) return { title: null, body: normalized };

  const title = match[1].replace(/^["'`]|["'`]$/g, "").trim();
  const body = lines.slice(firstFilled + 1).join("\n").trim();
  return { title: title || null, body };
}

export function pickDefaultBaseBranch(
  branches: Branch[],
  exclude?: string,
): string | null {
  const candidates = branches.filter((branch) => branch.name !== exclude);
  for (const name of DEFAULT_BRANCH_PRIORITY) {
    const local = candidates.find((branch) => !branch.is_remote && branch.name === name);
    if (local) return local.name;
    const remote = candidates.find(
      (branch) => branch.is_remote && branch.name === `origin/${name}`,
    );
    if (remote) return remote.name;
  }
  return candidates.find((branch) => !branch.is_remote)?.name ?? null;
}

export function branchTip(branches: Branch[], name: string | null | undefined): string | null {
  if (!name) return null;
  const branch = branches.find((entry) => entry.name === name);
  return branch ? normalizeGitOid(branch.tip) : null;
}
