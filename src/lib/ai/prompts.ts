export type AiFeature =
  | "commitMessage"
  | "conflictResolution"
  | "explainCommit"
  | "explainBranch"
  | "explainDiff"
  | "prDescription";

export interface AiPromptTemplateDef {
  feature: AiFeature;
  labelKey: string;
  descriptionKey: string;
  placeholders: readonly string[];
  defaultTemplate: string;
}

const COMMIT_MESSAGE_TEMPLATE = `You are an expert developer writing git commit messages.
Subject line: Conventional Commits (type(scope): imperative summary), aim ~72 characters; types include feat, fix, docs, style, refactor, perf, test, build, ci, chore.
After one blank line, add an explanatory body: summarize what changed file-wise if helpful, why it matters, breaking changes, risks, or follow-ups when relevant.
Use imperative mood in the subject; body may use normal prose.
Reply with only the final message text as for git commit: no preamble, no markdown fences, no quotes, no labels like "Subject:".`;

const CONFLICT_RESOLUTION_TEMPLATE = `You resolve a git merge conflict in {{file}}.
You get three versions of the same region: the common ancestor (base), our side and their side.
Merge the intent of both sides: keep every change that is still meaningful, drop nothing that only one side added unless the other side clearly removed it on purpose.
Never keep conflict markers (<<<<<<<, =======, >>>>>>>) and never invent code that is unrelated to the three versions.
Reply with the merged code only: no preamble, no explanation, no markdown fences.
Explanations, if requested separately, must be written in {{language}}.

--- base ---
{{base}}

--- ours ---
{{ours}}

--- theirs ---
{{theirs}}`;

const EXPLAIN_COMMIT_TEMPLATE = `You explain a single git commit to a developer who did not write it.
Cover what changed, why it likely changed, and which risks or follow-ups the change implies.
Be concrete: name files, functions and behaviour changes instead of restating the subject line.
Keep it short: a few sentences plus at most five bullet points.
Write the whole answer in {{language}} and reply with plain markdown, no code fences around the whole answer.

Subject: {{subject}}
Body: {{body}}
Stat: {{stat}}

Diff:
{{diff}}`;

const EXPLAIN_BRANCH_TEMPLATE = `You summarize the work on the git branch {{branch}} compared to {{base}}.
Describe the overall goal of the branch, the main building blocks, and anything a reviewer should watch out for.
Group related commits instead of listing every commit separately.
Keep it short: a few sentences plus at most five bullet points.
Write the whole answer in {{language}} and reply with plain markdown.

Commits:
{{commits}}

Diff:
{{diff}}`;

const EXPLAIN_DIFF_TEMPLATE = `You explain a diff of {{file}} to a reviewer.
Say what the change does, how it changes behaviour, and which edge cases or risks it introduces.
Be concrete and skip anything that is obvious from the file name.
Keep it short: a few sentences plus at most five bullet points.
Write the whole answer in {{language}} and reply with plain markdown.

Diff:
{{diff}}`;

const PR_DESCRIPTION_TEMPLATE = `You write the description of a pull request from {{branch}} into {{base}}.
Structure: a short summary paragraph, then a "Changes" list of the substantial changes, then a "Testing" note when the commits allow one.
Describe the outcome for the reader, not the commit history; merge related commits into one bullet.
Never invent tickets, links or test results that are not present in the input.
Write the whole answer in {{language}} and reply with plain markdown, no surrounding code fence.

Commits:
{{commits}}

Diff:
{{diff}}`;

export const AI_PROMPT_TEMPLATES: Record<AiFeature, AiPromptTemplateDef> = {
  commitMessage: {
    feature: "commitMessage",
    labelKey: "settings.aiPromptFeatures.commitMessage.label",
    descriptionKey: "settings.aiPromptFeatures.commitMessage.desc",
    placeholders: ["diff", "language", "layout"],
    defaultTemplate: COMMIT_MESSAGE_TEMPLATE,
  },
  conflictResolution: {
    feature: "conflictResolution",
    labelKey: "settings.aiPromptFeatures.conflictResolution.label",
    descriptionKey: "settings.aiPromptFeatures.conflictResolution.desc",
    placeholders: ["file", "base", "ours", "theirs", "language"],
    defaultTemplate: CONFLICT_RESOLUTION_TEMPLATE,
  },
  explainCommit: {
    feature: "explainCommit",
    labelKey: "settings.aiPromptFeatures.explainCommit.label",
    descriptionKey: "settings.aiPromptFeatures.explainCommit.desc",
    placeholders: ["subject", "body", "stat", "diff", "language"],
    defaultTemplate: EXPLAIN_COMMIT_TEMPLATE,
  },
  explainBranch: {
    feature: "explainBranch",
    labelKey: "settings.aiPromptFeatures.explainBranch.label",
    descriptionKey: "settings.aiPromptFeatures.explainBranch.desc",
    placeholders: ["branch", "base", "commits", "diff", "language"],
    defaultTemplate: EXPLAIN_BRANCH_TEMPLATE,
  },
  explainDiff: {
    feature: "explainDiff",
    labelKey: "settings.aiPromptFeatures.explainDiff.label",
    descriptionKey: "settings.aiPromptFeatures.explainDiff.desc",
    placeholders: ["file", "diff", "language"],
    defaultTemplate: EXPLAIN_DIFF_TEMPLATE,
  },
  prDescription: {
    feature: "prDescription",
    labelKey: "settings.aiPromptFeatures.prDescription.label",
    descriptionKey: "settings.aiPromptFeatures.prDescription.desc",
    placeholders: ["branch", "base", "commits", "diff", "language"],
    defaultTemplate: PR_DESCRIPTION_TEMPLATE,
  },
};

export const AI_FEATURES: readonly AiFeature[] = [
  "commitMessage",
  "conflictResolution",
  "explainCommit",
  "explainBranch",
  "explainDiff",
  "prDescription",
];

export function isAiFeature(value: unknown): value is AiFeature {
  return typeof value === "string" && value in AI_PROMPT_TEMPLATES;
}

export function defaultPromptTemplate(feature: AiFeature): string {
  return AI_PROMPT_TEMPLATES[feature].defaultTemplate;
}

export function promptPlaceholders(feature: AiFeature): readonly string[] {
  return AI_PROMPT_TEMPLATES[feature].placeholders;
}

export type TemplateValues = Record<string, string | number | null | undefined>;

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function renderTemplate(template: string, values: TemplateValues = {}): string {
  return template.replace(PLACEHOLDER_PATTERN, (_match, key: string) => {
    const value = values[key];
    if (value === undefined || value === null) return "";
    return String(value);
  });
}

export function templatePlaceholdersUsed(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) found.add(match[1]);
  return [...found];
}
