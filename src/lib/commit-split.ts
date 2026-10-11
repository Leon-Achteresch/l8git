import { invoke } from "@tauri-apps/api/core";
import { generateText } from "ai";

import { buildLanguageModel, resolveAiLanguage, hasAiCredentials } from "@/lib/ai/core";
import { useCommitPrefs } from "@/lib/commit-prefs";
import i18n from "@/lib/i18n";
import type { StatusEntry } from "@/lib/repo-store";
import {
  buildPatchesForSelection,
  parseDiffWithHunks,
  type ParsedDiff,
  type ParsedHunk,
} from "@/lib/unified-diff";

export const MAX_SPLIT_PROMPT_CHARS = 44_000;
export const MAX_UNIT_PREVIEW_CHARS = 3_600;
export const COLLECT_GROUP_ID = "collected";

export type SplitUnitKind = "hunk" | "file";

export interface SplitUnit {
  id: string;
  file: string;
  kind: SplitUnitKind;
  header: string;
  additions: number;
  deletions: number;
  signature: string;
  hunkPayload: string;
  preview: string;
  hunkIndex: number;
  untracked: boolean;
  binary: boolean;
}

export interface SplitFileInput {
  file: string;
  diff: string | null;
  wholeFile: boolean;
  untracked: boolean;
  binary: boolean;
  additions: number;
  deletions: number;
}

export interface SplitGroup {
  id: string;
  message: string;
  rationale: string;
  unitIds: string[];
}

export interface SplitPlan {
  groups: SplitGroup[];
}

export interface RawSplitGroup {
  message: string;
  rationale: string;
  units: string[];
}

export type SplitValidation =
  | { ok: true; plan: SplitPlan; warnings: string[] }
  | { ok: false; reason: string };

export class SplitPlanError extends Error {
  constructor(message: string, public readonly preserveStaging = false) {
    super(message);
  }
}

export function fileNeedsWholeUnit(entry: StatusEntry): boolean {
  if (entry.untracked || entry.binary || entry.embedded_repo) return true;
  const flags = `${entry.index_status}${entry.worktree_status}`;
  return flags.includes("D") || flags.includes("R") || flags.includes("T");
}

export function hunkSignature(hunk: ParsedHunk): string {
  return hunk.lines
    .filter((line) => line.kind === "add" || line.kind === "del")
    .map((line) => `${line.kind === "add" ? "+" : "-"}${line.text}`)
    .join("\n");
}

function hunkStats(hunk: ParsedHunk): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of hunk.lines) {
    if (line.kind === "add") additions += 1;
    else if (line.kind === "del") deletions += 1;
  }
  return { additions, deletions };
}

function hunkText(hunk: ParsedHunk): string {
  return [hunk.header, ...hunk.lines.map((line) => line.raw)].join("\n");
}

export function buildSplitUnits(files: readonly SplitFileInput[]): SplitUnit[] {
  const units: SplitUnit[] = [];
  let counter = 0;
  const nextId = () => `u${++counter}`;

  for (const file of files) {
    const parsed = file.wholeFile || !file.diff?.trim() ? null : parseDiffWithHunks(file.diff);
    if (!parsed || parsed.hunks.length === 0) {
      units.push({
        id: nextId(),
        file: file.file,
        kind: "file",
        header: "",
        additions: file.additions,
        deletions: file.deletions,
        signature: `file:${file.file}`,
        hunkPayload: "",
        preview: file.binary ? "" : (file.diff ?? "").slice(0, MAX_UNIT_PREVIEW_CHARS),
        hunkIndex: -1,
        untracked: file.untracked,
        binary: file.binary,
      });
      continue;
    }
    parsed.hunks.forEach((hunk, hunkIndex) => {
      const stats = hunkStats(hunk);
      units.push({
        id: nextId(),
        file: file.file,
        kind: "hunk",
        header: hunk.header,
        additions: stats.additions,
        deletions: stats.deletions,
        signature: hunkSignature(hunk),
        hunkPayload: hunk.lines.map((line) => line.raw).join("\n"),
        preview: hunkText(hunk).slice(0, MAX_UNIT_PREVIEW_CHARS),
        hunkIndex,
        untracked: false,
        binary: false,
      });
    });
  }

  return units;
}

export function unitLabel(unit: SplitUnit): string {
  if (unit.kind === "file") return unit.file;
  const range = unit.header.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
  if (!range) return unit.file;
  const start = Number(range[1]);
  const count = range[2] !== undefined ? Number(range[2]) : 1;
  const end = count > 0 ? start + count - 1 : start;
  return `${unit.file}:${start}-${end}`;
}

export function unitTotals(units: readonly SplitUnit[]): {
  units: number;
  files: number;
  additions: number;
  deletions: number;
} {
  const files = new Set<string>();
  let additions = 0;
  let deletions = 0;
  for (const unit of units) {
    files.add(unit.file);
    additions += unit.additions;
    deletions += unit.deletions;
  }
  return { units: units.length, files: files.size, additions, deletions };
}

export const SPLIT_SYSTEM_PROMPT = `You split a working-tree change set into a few coherent git commits.
Rules:
- Group the given change units by intent, not by file: a unit belongs with the units it only makes sense together with.
- Prefer 2 to 5 commits. Use a single commit only when the change really is one concern.
- Every unit id must appear in exactly one group. Never invent ids, never drop ids, never repeat an id.
- Order the groups so that each commit could build on the previous one.
- Each message uses Conventional Commits: "type(scope): imperative summary", <= 72 characters for the subject line. A short body after one blank line is allowed when it adds information.
- Each rationale is one short sentence explaining why these units belong together.
Answer with raw JSON only, no prose, no markdown fences:
{"groups":[{"message":"feat(x): ...","rationale":"...","units":["u1","u2"]}]}`;

export function buildSplitPrompt(
  units: readonly SplitUnit[],
  options: { language?: string; maxChars?: number } = {},
): string {
  const maxChars = options.maxChars ?? MAX_SPLIT_PROMPT_CHARS;
  const language = (options.language ?? "").trim();
  const head = [
    `Change units: ${units.length}.`,
    language ? `Write every commit message and rationale in ${language}.` : "",
    "Units:",
  ]
    .filter(Boolean)
    .join("\n");

  const blocks: string[] = [];
  let used = head.length;
  for (const unit of units) {
    const kind = unit.kind === "file" ? (unit.untracked ? "new file" : "whole file") : "hunk";
    const stats = `+${unit.additions}/-${unit.deletions}`;
    const body = unit.binary ? "(binary)" : unit.preview;
    const block = `--- ${unit.id} | ${unit.file} | ${kind} | ${stats}\n${body}`;
    if (used + block.length > maxChars) {
      blocks.push(`--- ${unit.id} | ${unit.file} | ${kind} | ${stats}\n(diff omitted, budget reached)`);
      used += 80;
      continue;
    }
    blocks.push(block);
    used += block.length;
  }

  return `${head}\n${blocks.join("\n")}`;
}

function extractJsonBlock(text: string): string | null {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

export function parseSplitResponse(text: string): RawSplitGroup[] {
  const block = extractJsonBlock(text ?? "");
  if (!block) throw new SplitPlanError("no JSON object found in the answer");

  let payload: unknown;
  try {
    payload = JSON.parse(block);
  } catch {
    throw new SplitPlanError("the answer is not valid JSON");
  }

  const groups = (payload as { groups?: unknown })?.groups;
  if (!Array.isArray(groups)) throw new SplitPlanError('the JSON has no "groups" array');

  return groups.map((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    const units = Array.isArray(record.units) ? record.units : [];
    return {
      message: typeof record.message === "string" ? record.message.trim() : "",
      rationale: typeof record.rationale === "string" ? record.rationale.trim() : "",
      units: units.filter((id): id is string => typeof id === "string").map((id) => id.trim()),
    };
  });
}

export function validateSplitPlan(
  units: readonly SplitUnit[],
  raw: readonly RawSplitGroup[],
): SplitValidation {
  const known = new Set(units.map((unit) => unit.id));
  const warnings: string[] = [];
  const seen = new Set<string>();
  const groups: SplitGroup[] = [];

  for (const [index, group] of raw.entries()) {
    const unitIds: string[] = [];
    for (const id of group.units) {
      if (!known.has(id)) {
        warnings.push(`unknown unit ${id} dropped`);
        continue;
      }
      if (seen.has(id)) return { ok: false, reason: `unit ${id} was assigned more than once` };
      seen.add(id);
      unitIds.push(id);
    }
    if (unitIds.length === 0) {
      warnings.push(`group ${index + 1} had no usable units and was dropped`);
      continue;
    }
    if (!group.message) return { ok: false, reason: `group ${index + 1} has no commit message` };
    groups.push({
      id: `g${groups.length + 1}`,
      message: group.message,
      rationale: group.rationale,
      unitIds,
    });
  }

  if (groups.length === 0) return { ok: false, reason: "no usable group in the answer" };

  const missing = units.filter((unit) => !seen.has(unit.id)).map((unit) => unit.id);
  if (missing.length > 0) {
    return { ok: false, reason: `these units were not assigned: ${missing.join(", ")}` };
  }

  return { ok: true, plan: { groups }, warnings };
}

export function planUnitIds(plan: SplitPlan): string[] {
  return plan.groups.flatMap((group) => group.unitIds);
}

export function moveUnits(plan: SplitPlan, unitIds: readonly string[], targetId: string): SplitPlan {
  const moving = new Set(unitIds);
  if (moving.size === 0) return plan;
  if (!plan.groups.some((group) => group.id === targetId)) return plan;

  const ordered = plan.groups
    .flatMap((group) => group.unitIds)
    .filter((id) => moving.has(id));

  const groups = plan.groups.map((group) => {
    const kept = group.unitIds.filter((id) => !moving.has(id));
    if (group.id !== targetId) return { ...group, unitIds: kept };
    const merged = [...kept];
    for (const id of ordered) if (!merged.includes(id)) merged.push(id);
    return { ...group, unitIds: merged };
  });

  return { groups };
}

export function removeSplitGroup(
  plan: SplitPlan,
  groupId: string,
  collectMessage: string,
): SplitPlan {
  const target = plan.groups.find((group) => group.id === groupId);
  if (!target || plan.groups.length <= 1) return plan;

  const rest = plan.groups.filter((group) => group.id !== groupId);
  const collector = rest.find((group) => group.id === COLLECT_GROUP_ID);
  if (collector) {
    return {
      groups: rest.map((group) =>
        group.id === COLLECT_GROUP_ID
          ? { ...group, unitIds: [...group.unitIds, ...target.unitIds] }
          : group,
      ),
    };
  }

  return {
    groups: [
      ...rest,
      {
        id: COLLECT_GROUP_ID,
        message: collectMessage,
        rationale: "",
        unitIds: [...target.unitIds],
      },
    ],
  };
}

export function renameSplitGroup(plan: SplitPlan, groupId: string, message: string): SplitPlan {
  return {
    groups: plan.groups.map((group) => (group.id === groupId ? { ...group, message } : group)),
  };
}

export function addSplitGroup(plan: SplitPlan, message: string): SplitPlan {
  const used = new Set(plan.groups.map((group) => group.id));
  let index = plan.groups.length + 1;
  while (used.has(`g${index}`)) index += 1;
  return {
    groups: [...plan.groups, { id: `g${index}`, message, rationale: "", unitIds: [] }],
  };
}

export function planIssues(plan: SplitPlan, units: readonly SplitUnit[]): string[] {
  const issues: string[] = [];
  const assigned = planUnitIds(plan);
  const unique = new Set(assigned);
  if (assigned.length !== unique.size) issues.push("duplicate");
  if (unique.size !== units.length) issues.push("coverage");
  if (plan.groups.some((group) => group.unitIds.length > 0 && !group.message.trim())) {
    issues.push("message");
  }
  if (plan.groups.every((group) => group.unitIds.length === 0)) issues.push("empty");
  return issues;
}

export function runnableGroups(plan: SplitPlan): SplitGroup[] {
  return plan.groups.filter((group) => group.unitIds.length > 0);
}

export function matchUnitsToHunks(
  parsed: ParsedDiff,
  signatures: readonly string[],
): { indices: number[]; missing: string[] } {
  const used = new Set<number>();
  const indices: number[] = [];
  const missing: string[] = [];

  for (const signature of signatures) {
    const found = parsed.hunks.findIndex(
      (hunk, index) => !used.has(index) && hunkSignature(hunk) === signature,
    );
    if (found < 0) {
      missing.push(signature);
      continue;
    }
    used.add(found);
    indices.push(found);
  }

  return { indices: indices.sort((a, b) => a - b), missing };
}

export function selectionKeysForHunks(
  parsed: ParsedDiff,
  hunkIndices: readonly number[],
): Set<string> {
  const keys = new Set<string>();
  for (const hunkIdx of hunkIndices) {
    const hunk = parsed.hunks[hunkIdx];
    if (!hunk) continue;
    hunk.lines.forEach((line, lineIdx) => {
      if (line.kind === "add" || line.kind === "del") keys.add(`${hunkIdx}:${lineIdx}`);
    });
  }
  return keys;
}

export interface SplitPlanResult {
  plan: SplitPlan;
  warnings: string[];
  attempts: number;
}

export async function planSplitFromUnits(
  units: readonly SplitUnit[],
  options: { repoPath?: string; maxAttempts?: number } = {},
): Promise<SplitPlanResult> {
  if (units.length === 0) throw new SplitPlanError(i18n.t("commitSplit.errorNoUnits"));

  const { aiProviderType, aiProviderApiKey, aiProviderModel, aiProviderBaseUrl } =
    useCommitPrefs.getState();

  if (!hasAiCredentials({
    type: aiProviderType,
    apiKey: aiProviderApiKey,
    model: aiProviderModel,
    baseUrl: aiProviderBaseUrl,
  })) {
    throw new SplitPlanError(i18n.t("errors.aiNoApiKey"));
  }

  const language = resolveAiLanguage(options.repoPath);

  const model = buildLanguageModel(
    aiProviderType,
    aiProviderApiKey,
    aiProviderModel,
    aiProviderBaseUrl,
  );
  const basePrompt = buildSplitPrompt(units, { language });
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);

  let lastReason = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt = lastReason
      ? `${basePrompt}\n\nYour previous answer was rejected: ${lastReason}\nAnswer again with raw JSON only and assign every unit id exactly once.`
      : basePrompt;

    let text: string;
    try {
      const result = await generateText({ model, system: SPLIT_SYSTEM_PROMPT, prompt });
      text = result.text ?? "";
    } catch (cause) {
      throw new SplitPlanError(cause instanceof Error ? cause.message : String(cause));
    }

    let raw: RawSplitGroup[];
    try {
      raw = parseSplitResponse(text);
    } catch (cause) {
      lastReason = cause instanceof Error ? cause.message : String(cause);
      continue;
    }

    const validation = validateSplitPlan(units, raw);
    if (validation.ok) {
      return { plan: validation.plan, warnings: validation.warnings, attempts: attempt };
    }
    lastReason = validation.reason;
  }

  throw new SplitPlanError(i18n.t("commitSplit.errorInvalidPlan", { reason: lastReason }));
}

export interface FileDiffPayload {
  staged: string | null;
  unstaged: string | null;
  untracked_plain: string | null;
  is_binary: boolean;
}

export type CommitSplitSnapshot = Readonly<{
  head: string | null;
  branch: string | null;
  indexFingerprint: string;
  worktreeFingerprint: string;
}>;

function snapshotInvalid(): SplitPlanError {
  return new SplitPlanError(i18n.t("commitSplit.errorSnapshotInvalid"), true);
}

export function readCommitSplitSnapshot(value: unknown): CommitSplitSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw snapshotInvalid();
  const snapshot = value as Record<string, unknown>;
  if (!(snapshot.head === null || typeof snapshot.head === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(snapshot.head)) ||
    !(snapshot.branch === null || typeof snapshot.branch === "string" && !!snapshot.branch.trim()) ||
    typeof snapshot.indexFingerprint !== "string" || !snapshot.indexFingerprint.trim() ||
    typeof snapshot.worktreeFingerprint !== "string" || !snapshot.worktreeFingerprint.trim()) throw snapshotInvalid();
  return Object.freeze({ head: snapshot.head, branch: snapshot.branch,
    indexFingerprint: snapshot.indexFingerprint, worktreeFingerprint: snapshot.worktreeFingerprint });
}

function sameSnapshot(left: CommitSplitSnapshot, right: CommitSplitSnapshot): boolean {
  return left.head === right.head && left.branch === right.branch &&
    left.indexFingerprint === right.indexFingerprint && left.worktreeFingerprint === right.worktreeFingerprint;
}

export interface SplitCollection {
  units: SplitUnit[];
  hadStaged: boolean;
  snapshot: CommitSplitSnapshot;
}

export async function collectSplitInputs(
  path: string,
  options: { shouldCancel?: () => boolean } = {},
): Promise<SplitCollection> {
  const checkCurrent = () => {
    if (options.shouldCancel?.()) throw new SplitPlanError(i18n.t("commitSplit.cancelledHint"), true);
  };
  checkCurrent();
  let entries = await invoke<StatusEntry[]>("repo_status", { path });
  checkCurrent();
  if (!Array.isArray(entries)) throw snapshotInvalid();
  const hadStaged = entries.some((entry) => entry.staged);

  if (hadStaged) {
    await invoke("unstage_files", { path, files: ["."] });
    checkCurrent();
    // A staged rename becomes a source deletion and an untracked destination.
    // Rebuild the complete change set after flattening the index.
    entries = await invoke<StatusEntry[]>("repo_status", { path });
    checkCurrent();
    if (!Array.isArray(entries)) throw snapshotInvalid();
  }
  const changed = entries.filter(
    (entry) => entry.staged || entry.unstaged || entry.untracked,
  );
  const files = [...new Set(changed.map(entry => entry.path))];
  const snapshot = readCommitSplitSnapshot(await invoke("git_commit_split_snapshot", { path, files }));
  checkCurrent();

  const inputs: SplitFileInput[] = [];
  for (const entry of changed) {
    const wholeFile = fileNeedsWholeUnit(entry);
    let diff: string | null = null;
    if (!wholeFile) {
      const payload = await invoke<FileDiffPayload>("repo_file_diff", {
        path,
        file: entry.path,
        untracked: false,
      });
      checkCurrent();
      if (!payload || payload.is_binary || payload.staged?.trim()) {
        throw new SplitPlanError("__SPLIT_REVIEW_CHANGED__", true);
      }
      diff = payload.unstaged ?? payload.staged ?? null;
    }
    inputs.push({
      file: entry.path,
      diff,
      wholeFile: wholeFile || !diff?.trim(),
      untracked: entry.untracked,
      binary: entry.binary,
      additions: entry.additions_staged + entry.additions_unstaged,
      deletions: entry.deletions_staged + entry.deletions_unstaged,
    });
  }
  const after = readCommitSplitSnapshot(await invoke("git_commit_split_snapshot", { path, files }));
  checkCurrent();
  if (!sameSnapshot(snapshot, after)) throw new SplitPlanError("__SPLIT_REVIEW_CHANGED__", true);
  return { units: buildSplitUnits(inputs), hadStaged, snapshot };
}

export interface SplitApplyProgress {
  groupIndex: number;
  groupCount: number;
  message: string;
  phase: "staging" | "committing";
}

export interface SplitApplyResult {
  committed: number;
  cancelled: boolean;
  remaining: number;
}

export async function applySplitPlan(options: {
  path: string;
  plan: SplitPlan;
  units: readonly SplitUnit[];
  snapshot: CommitSplitSnapshot;
  sign?: boolean | null;
  onProgress?: (progress: SplitApplyProgress) => void;
  shouldCancel?: () => boolean;
}): Promise<SplitApplyResult> {
  const { path, onProgress, shouldCancel } = options;
  const units = options.units.map(unit => ({ ...unit }));
  const plan = { groups: options.plan.groups.map(group => ({ ...group, unitIds: [...group.unitIds] })) };
  const issues = planIssues(plan, units);
  const knownIds = new Set(units.map(unit => unit.id));
  if (issues.length || planUnitIds(plan).some(id => !knownIds.has(id)) || knownIds.size !== units.length) {
    throw new SplitPlanError(i18n.t("commitSplit.errorInvalidPlan", { reason: issues.join(", ") || "coverage" }), true);
  }
  let expected = readCommitSplitSnapshot(options.snapshot);
  const worktreeFingerprint = expected.worktreeFingerprint;
  const files = [...new Set(units.map(unit => unit.file))];
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const groups = runnableGroups(plan);
  const committedUnitIds = new Set<string>();
  let committed = 0;

  for (const [groupIndex, group] of groups.entries()) {
    if (shouldCancel?.()) {
      return { committed, cancelled: true, remaining: groups.length - groupIndex };
    }

    onProgress?.({
      groupIndex,
      groupCount: groups.length,
      message: group.message,
      phase: "staging",
    });

    const remainingByFile = new Map<string, SplitUnit[]>();
    for (const unit of units) {
      if (unit.kind !== "hunk" || committedUnitIds.has(unit.id)) continue;
      const list = remainingByFile.get(unit.file) ?? [];
      list.push(unit);
      remainingByFile.set(unit.file, list);
    }
    const parsedByFile = new Map<string, ParsedDiff>();
    const indexByUnitId = new Map<string, number>();
    try {
      for (const [file, remaining] of remainingByFile) {
        if (shouldCancel?.()) return { committed, cancelled: true, remaining: groups.length - groupIndex };
        const payload = await invoke<FileDiffPayload>("repo_file_diff", {
          path, file, untracked: false,
        });
        if (shouldCancel?.()) return { committed, cancelled: true, remaining: groups.length - groupIndex };
        if (!payload) {
          throw new SplitPlanError(i18n.t("commitSplit.errorHunkGone", { file }));
        }
        if (payload.staged?.trim()) {
          throw new SplitPlanError(i18n.t("commitSplit.errorStagingChanged"));
        }
        const parsed = parseDiffWithHunks(payload.unstaged ?? "");
        const ordered = [...remaining].sort((a, b) => a.hunkIndex - b.hunkIndex);
        // Match the entire remaining sequence, including duplicate changes.
        // Headers contain line numbers that legitimately move after a commit;
        // the untruncated payload/context retains the reviewed unit's identity.
        if (parsed.hunks.length !== ordered.length || ordered.some((unit, index) => {
          const hunk = parsed.hunks[index];
          return (index > 0 && unit.hunkIndex === ordered[index - 1].hunkIndex)
            || unit.signature !== hunkSignature(hunk)
            || unit.hunkPayload !== hunk.lines.map((line) => line.raw).join("\n");
        })) {
          throw new SplitPlanError(i18n.t("commitSplit.errorHunkGone", { file }), true);
        }
        ordered.forEach((unit, index) => indexByUnitId.set(unit.id, index));
        parsedByFile.set(file, parsed);
      }
    } catch (cause) {
      throw new SplitPlanError(cause instanceof Error ? cause.message : String(cause), true);
    }

    const byFile = new Map<string, SplitUnit[]>();
    for (const id of group.unitIds) {
      const unit = byId.get(id);
      if (!unit) continue;
      const list = byFile.get(unit.file) ?? [];
      list.push(unit);
      byFile.set(unit.file, list);
    }

    const selections: { file: string; patches: string[] | null }[] = [];
    for (const [file, fileUnits] of byFile) {
      if (fileUnits.some((unit) => unit.kind === "file")) {
        selections.push({ file, patches: null });
        continue;
      }
      const parsed = parsedByFile.get(file);
      const indices = fileUnits.map((unit) => indexByUnitId.get(unit.id));
      if (!parsed || indices.some((index) => index === undefined) || indices.length === 0) {
        throw new SplitPlanError(i18n.t("commitSplit.errorHunkGone", { file }), true);
      }
      const patches = buildPatchesForSelection(parsed, selectionKeysForHunks(parsed, indices as number[]));
      if (!patches.length) throw new SplitPlanError(i18n.t("commitSplit.errorHunkGone", { file }), true);
      selections.push({ file, patches });
    }

    onProgress?.({
      groupIndex,
      groupCount: groups.length,
      message: group.message,
      phase: "committing",
    });
    if (shouldCancel?.()) return { committed, cancelled: true, remaining: groups.length - groupIndex };
    try {
      const next = readCommitSplitSnapshot(await invoke("git_commit_split_group_checked", {
        path, files: [...files], expected, selections,
        message: group.message.trim(), sign: options.sign ?? null,
      }));
      if (next.head === null || next.head === expected.head || next.branch !== expected.branch ||
        next.worktreeFingerprint !== worktreeFingerprint) throw snapshotInvalid();
      expected = next;
    } catch (cause) {
      throw new SplitPlanError(cause instanceof Error ? cause.message : String(cause), true);
    }
    committed += 1;
    group.unitIds.forEach((id) => committedUnitIds.add(id));
  }

  return { committed, cancelled: false, remaining: 0 };
}
