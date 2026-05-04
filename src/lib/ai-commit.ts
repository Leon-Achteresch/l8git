import { OpenRouter } from "@openrouter/sdk";
import { useCommitPrefs } from "@/lib/commit-prefs";

const MAX_STAGED_DIFF_CHARS = 48_000;
const MODEL = "deepseek/deepseek-v4-flash";

export const DEFAULT_AI_PROMPT_TEMPLATE = `You are an expert developer writing git commit messages.
Subject line: Conventional Commits (type(scope): imperative summary), aim ~72 characters; types include feat, fix, docs, style, refactor, perf, test, build, ci, chore.
After one blank line, add an explanatory body: summarize what changed file-wise if helpful, why it matters, breaking changes, risks, or follow-ups when relevant.
Use imperative mood in the subject; body may use normal prose.
Reply with only the final message text as for git commit: no preamble, no markdown fences, no quotes, no labels like "Subject:".`;

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

export async function generateAiCommitMessage(stagedDiff: string): Promise<string> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("VITE_OPENROUTER_API_KEY ist nicht gesetzt");
  const trimmedDiff = stagedDiff.trim();
  if (!trimmedDiff) throw new Error("Kein gestagter Diff vorhanden");

  const { aiPromptTemplate, aiOutputLanguage, messageTemplate } = useCommitPrefs.getState();

  const basePrompt = aiPromptTemplate.trim() || DEFAULT_AI_PROMPT_TEMPLATE;
  const language = aiOutputLanguage.trim() || "English";
  const layout = messageTemplate.trim();

  const layoutSection = layout
    ? `\n\nMandatory layout: reproduce this structure exactly — keep blank lines and bullet or section markers as shown; replace hints or empty lines with substantive explanatory content grounded in the diff.\n---\n${layout}\n---`
    : "";

  const systemPrompt = `${basePrompt}${layoutSection}\n\nLanguage: write the entire commit message (subject and body) in ${language}.\n\nOutput: plain text only, exactly as it should be pasted into git commit; no preamble, no markdown code fences, no surrounding quotes.`;

  const diffBody = trimmedDiff.slice(0, MAX_STAGED_DIFF_CHARS);

  const client = new OpenRouter({ apiKey });

  const completion = await client.chat.send({
    chatRequest: {
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Write the commit message from this staged diff (all files):\n\n\`\`\`diff\n${diffBody}\n\`\`\``,
        },
      ],
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (typeof content !== "string" || !content) throw new Error("Keine Antwort vom AI-Modell erhalten");
  return normalizeCommitMessageText(content);
}
