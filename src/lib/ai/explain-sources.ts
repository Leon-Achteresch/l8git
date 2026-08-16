import { invoke } from "@tauri-apps/api/core";

import { AiError, generateAiText, resolveAiLanguage } from "@/lib/ai/core";
import {
  EXPLAIN_COMMIT_DIFF_BUDGET,
  EXPLAIN_FILE_DIFF_BUDGET,
  EXPLAIN_MAX_COMMITS,
  EXPLAIN_MAX_DIFF_FILES,
  EXPLAIN_MAX_STAT_COMMITS,
  branchTip,
  commitsInRange,
  fitDiffToBudget,
  formatCommitList,
  formatDiffStat,
  joinFileDiffs,
  mergeFileStats,
  parseCommitHeader,
  splitPrDraft,
  type FileStat,
  type PrDraft,
} from "@/lib/ai/explain-inputs";
import { getPromptTemplate } from "@/lib/ai/prompt-prefs";
import { renderTemplate } from "@/lib/ai/prompts";
import i18n from "@/lib/i18n";
import { useRepoStore } from "@/lib/repo-store";

type CommitInspectPayload = {
  header: string;
  files: { path: string; additions: number; deletions: number; binary: boolean }[];
};

type CommitFileDiffPayload = { diff: string | null; is_binary: boolean };

export interface ExplainRunOptions {
  hint?: string;
  signal?: AbortSignal;
}

export interface CommitExplainInput {
  subject: string;
  body: string;
  stat: string;
  diff: string;
  truncated: boolean;
}

export interface BranchExplainInput {
  commits: string;
  stat: string;
  commitCount: number;
  truncated: boolean;
}

async function inspectCommit(
  repoPath: string,
  commit: string,
): Promise<CommitInspectPayload> {
  return invoke<CommitInspectPayload>("repo_commit_inspect", {
    path: repoPath,
    commit,
  });
}

export async function loadCommitExplainInput(
  repoPath: string,
  commitHash: string,
  signal?: AbortSignal,
): Promise<CommitExplainInput> {
  const payload = await inspectCommit(repoPath, commitHash);
  if (signal?.aborted) throw new AiError("aborted", i18n.t("errors.aiAborted"), "explainCommit");

  const { subject, body, stat } = parseCommitHeader(payload.header);
  const textFiles = payload.files
    .filter((file) => !file.binary)
    .slice(0, EXPLAIN_MAX_DIFF_FILES);

  const parts = await Promise.all(
    textFiles.map(async (file) => {
      try {
        const diff = await invoke<CommitFileDiffPayload>("repo_commit_file_diff", {
          path: repoPath,
          commit: commitHash,
          file: file.path,
        });
        return { file: file.path, diff: diff.diff ?? "" };
      } catch {
        return { file: file.path, diff: "" };
      }
    }),
  );

  const joined = joinFileDiffs(parts, EXPLAIN_COMMIT_DIFF_BUDGET);
  const statText = stat || formatDiffStat(payload.files);
  return {
    subject,
    body,
    stat: statText,
    diff: joined.text,
    truncated: joined.truncated || textFiles.length < payload.files.length,
  };
}

export async function loadBranchExplainInput(
  repoPath: string,
  branch: string,
  base: string | null,
  signal?: AbortSignal,
): Promise<BranchExplainInput> {
  const repo = useRepoStore.getState().repos[repoPath];
  const commits = repo?.commits ?? [];
  const branches = repo?.branches ?? [];
  const tip = branchTip(branches, branch);
  if (!tip) {
    throw new AiError("empty", i18n.t("errors.aiNoBranchCommits"), "explainBranch");
  }

  const range = commitsInRange(commits, tip, branchTip(branches, base), EXPLAIN_MAX_COMMITS);
  if (range.length === 0) {
    throw new AiError("empty", i18n.t("errors.aiNoBranchCommits"), "explainBranch");
  }

  const statCommits = range
    .filter((commit) => commit.parents.length <= 1)
    .slice(0, EXPLAIN_MAX_STAT_COMMITS);

  const groups = await Promise.all(
    statCommits.map(async (commit): Promise<FileStat[]> => {
      try {
        const payload = await inspectCommit(repoPath, commit.hash);
        return payload.files;
      } catch {
        return [];
      }
    }),
  );
  if (signal?.aborted) throw new AiError("aborted", i18n.t("errors.aiAborted"), "explainBranch");

  return {
    commits: formatCommitList(range),
    stat: formatDiffStat(mergeFileStats(groups)),
    commitCount: range.length,
    truncated: statCommits.length < range.length,
  };
}

export async function generateCommitExplanation(
  repoPath: string,
  commitHash: string,
  options: ExplainRunOptions = {},
): Promise<string> {
  const input = await loadCommitExplainInput(repoPath, commitHash, options.signal);
  const prompt = renderTemplate(getPromptTemplate("explainCommit"), {
    subject: input.subject,
    body: input.body,
    stat: input.stat,
    diff: input.diff,
    language: resolveAiLanguage(repoPath),
  });
  return generateAiText({
    feature: "explainCommit",
    prompt,
    hint: options.hint,
    signal: options.signal,
  });
}

export async function generateBranchExplanation(
  repoPath: string,
  branch: string,
  base: string | null,
  options: ExplainRunOptions = {},
): Promise<string> {
  const input = await loadBranchExplainInput(repoPath, branch, base, options.signal);
  const prompt = renderTemplate(getPromptTemplate("explainBranch"), {
    branch,
    base: base ?? "",
    commits: input.commits,
    diff: input.stat,
    language: resolveAiLanguage(repoPath),
  });
  return generateAiText({
    feature: "explainBranch",
    prompt,
    hint: options.hint,
    signal: options.signal,
  });
}

export async function generateDiffExplanation(
  repoPath: string,
  file: string,
  diff: string,
  options: ExplainRunOptions = {},
): Promise<string> {
  const fitted = fitDiffToBudget(diff, EXPLAIN_FILE_DIFF_BUDGET);
  if (!fitted.text) {
    throw new AiError("empty", i18n.t("errors.aiNoDiff"), "explainDiff");
  }
  const prompt = renderTemplate(getPromptTemplate("explainDiff"), {
    file,
    diff: fitted.text,
    language: resolveAiLanguage(repoPath),
  });
  return generateAiText({
    feature: "explainDiff",
    prompt,
    hint: options.hint,
    signal: options.signal,
  });
}

export interface PrDescriptionRequest {
  repoPath: string;
  head: string;
  base: string;
  withTitle?: boolean;
}

const TITLE_INSTRUCTION =
  '\n\nStart the answer with a single line "Title: <concise pull request title in imperative mood>", then an empty line, then the description itself.';

export async function generatePrDescription(
  request: PrDescriptionRequest,
  options: ExplainRunOptions = {},
): Promise<PrDraft> {
  const { repoPath, head, base, withTitle = false } = request;
  const input = await loadBranchExplainInput(repoPath, head, base, options.signal);
  const prompt = renderTemplate(getPromptTemplate("prDescription"), {
    branch: head,
    base,
    commits: input.commits,
    diff: input.stat,
    language: resolveAiLanguage(repoPath),
  });
  const text = await generateAiText({
    feature: "prDescription",
    prompt: withTitle ? `${prompt}${TITLE_INSTRUCTION}` : prompt,
    hint: options.hint,
    signal: options.signal,
  });
  const draft = splitPrDraft(text);
  return withTitle ? draft : { title: null, body: draft.body || text.trim() };
}
