import { useCommitPrefs } from "@/lib/commit-prefs";
import { generateAiText, resolveAiLanguage, truncateForPrompt } from "@/lib/ai/core";
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
  });

  return normalizeCommitMessageText(text);
}
