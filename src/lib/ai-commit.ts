import { useCommitPrefs } from "@/lib/commit-prefs";
import { generateAiText, getAiProviderConfig, hasAiCredentials, resolveAiLanguage, truncateForPrompt } from "@/lib/ai/core";
import { getPromptTemplate } from "@/lib/ai/prompt-prefs";
import { defaultPromptTemplate, renderTemplate } from "@/lib/ai/prompts";
import i18n from "@/lib/i18n";

const MAX_STAGED_DIFF_CHARS = 48_000;

export const DEFAULT_AI_PROMPT_TEMPLATE = defaultPromptTemplate("commitMessage");

function stripMarkdownFence(text: string): string {
  const s = text.trim();
  if (!s.startsWith("```")) return s;
  const withoutOpen = s.slice(3);
  const nl = withoutOpen.indexOf("\n");
  const afterLang = nl >= 0 ? withoutOpen.slice(nl + 1) : withoutOpen;
  const end = afterLang.lastIndexOf("```");
  const inner = end >= 0 ? afterLang.slice(0, end) : afterLang;
  return inner.trim();
}

function normalizeCommitMessageText(text: string): string {
  let s = stripMarkdownFence(text.trim());
  s = s.replace(/^\uFEFF/, "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  const lines = s.split("\n");
  let start = 0;
  while (start < lines.length) {
    const t = lines[start].trim();
    if (t === "") {
      start++;
      continue;
    }
    if (/^(here'?s|sure[!,.]?|okay[!,.]?|the commit message\s*:?)[:.]?$/i.test(t)) {
      start++;
      continue;
    }
    if (
      /^(here'?s|the commit message)\b/i.test(t) &&
      !/^[a-z]+(\([^)]+\))?!?:\s+\S/.test(t)
    ) {
      start++;
      continue;
    }
    break;
  }
  s = lines.slice(start).join("\n").trim();
  s = stripMarkdownFence(s).trim();
  const first = s.split("\n")[0]?.trim() ?? "";
  const cleanedFirst = first.replace(/^\*{0,2}subject\*{0,2}:?\s*/i, "").trim();
  if (cleanedFirst !== first && s.startsWith(first)) {
    s = cleanedFirst + s.slice(first.length);
  }
  return s.trim();
}

export interface AiCommitMessageOptions {
  hint?: string;
  signal?: AbortSignal;
  onDelta?: (partial: string) => void;
}

export async function generateAiCommitMessage(
  stagedDiff: string,
  repoPath?: string,
  options: AiCommitMessageOptions = {},
): Promise<string> {
  const trimmedDiff = stagedDiff.trim();
  if (!trimmedDiff) throw new Error(i18n.t("errors.aiNoDiff"));

  const language = resolveAiLanguage(repoPath);
  const layout = useCommitPrefs.getState().messageTemplate.trim();
  const diffBody = truncateForPrompt(trimmedDiff, MAX_STAGED_DIFF_CHARS);

  const layoutSection = layout
    ? `\n\nMandatory layout: reproduce this structure exactly — keep blank lines and bullet or section markers as shown; replace hints or empty lines with substantive explanatory content grounded in the diff.\n---\n${layout}\n---`
    : "";

  const basePrompt = renderTemplate(getPromptTemplate("commitMessage", { repoPath }), {
    language,
    layout,
    diff: diffBody,
  });

  const systemPrompt = `${basePrompt}${layoutSection}\n\nLanguage: write the entire commit message (subject and body) in ${language}.\n\nOutput: plain text only, exactly as it should be pasted into git commit; no preamble, no markdown code fences, no surrounding quotes.`;

  const text = await generateAiText({
    feature: "commitMessage",
    system: systemPrompt,
    prompt: `Write the commit message from this staged diff (all files):\n\n\`\`\`diff\n${diffBody}\n\`\`\``,
    hint: options.hint,
    signal: options.signal,
    ...(options.onDelta
      ? { onDelta: (full: string) => options.onDelta?.(normalizeCommitMessageText(full)) }
      : {}),
  });

  return normalizeCommitMessageText(text);
}

export type GitTextKind = "title" | "commit" | "pr";

export interface GenerateGitTextContext {
  diff?: string;
  branch?: string;
  base?: string;
  commits?: string;
  repoPath?: string;
  hint?: string;
  signal?: AbortSignal;
  onDelta?: (partial: string) => void;
}

export class GitTextCapabilityError extends Error {
  readonly kind: GitTextKind;
  readonly instanceId: string;

  constructor(kind: GitTextKind, instanceId: string, reason: string) {
    super(`Git-Text (${kind}) für Instanz "${instanceId}" nicht verfügbar: ${reason}`);
    this.name = "GitTextCapabilityError";
    this.kind = kind;
    this.instanceId = instanceId;
  }
}

const SUPPORTED_GIT_TEXT_INSTANCES = new Set(["default"]);

export async function generateGitText(
  kind: GitTextKind,
  context: GenerateGitTextContext = {},
  instanceId = "default",
): Promise<string> {
  if (!SUPPORTED_GIT_TEXT_INSTANCES.has(instanceId)) {
    throw new GitTextCapabilityError(
      kind,
      instanceId,
      `unbekannte Instanz, nur "default" wird für Git-Textgenerierung unterstützt`,
    );
  }

  const config = getAiProviderConfig();
  if (!hasAiCredentials(config)) {
    throw new GitTextCapabilityError(
      kind,
      instanceId,
      `Provider "${config.type}" hat keine gültigen Zugangsdaten`,
    );
  }

  if (kind === "commit") {
    const diff = context.diff?.trim() ?? "";
    if (!diff) throw new GitTextCapabilityError(kind, instanceId, "kein Diff für die Commit-Nachricht");
    return generateAiCommitMessage(diff, context.repoPath, {
      hint: context.hint,
      signal: context.signal,
      onDelta: context.onDelta,
    });
  }

  if (kind === "pr") {
    const diff = context.diff?.trim() ?? "";
    if (!diff) throw new GitTextCapabilityError(kind, instanceId, "kein Diff für die PR-Beschreibung");
    const language = resolveAiLanguage(context.repoPath);
    const diffBody = truncateForPrompt(diff, MAX_STAGED_DIFF_CHARS);
    const systemPrompt = renderTemplate(getPromptTemplate("prDescription", { repoPath: context.repoPath }), {
      language,
      branch: context.branch ?? "",
      base: context.base ?? "",
      commits: context.commits ?? "",
      diff: diffBody,
    });
    const text = await generateAiText({
      feature: "prDescription",
      system: systemPrompt,
      prompt: `Write the pull request description from this diff:\n\n\`\`\`diff\n${diffBody}\n\`\`\``,
      hint: context.hint,
      signal: context.signal,
      ...(context.onDelta ? { onDelta: context.onDelta } : {}),
    });
    return text.trim();
  }

  throw new GitTextCapabilityError(
    kind,
    instanceId,
    `Provider "${config.type}" unterstützt keine Titel-Generierung (keine passende Prompt-Vorlage konfiguriert)`,
  );
}
