import { OpenRouter } from "@openrouter/sdk";
import { useCommitPrefs } from "@/lib/commit-prefs";

const MAX_DIFF_CHARS = 2000;
const MODEL = "anthropic/claude-3-haiku";

export const DEFAULT_AI_PROMPT_TEMPLATE = `You are an expert developer writing git commit messages.
Follow the Conventional Commits specification strictly.
- Format: type(scope): description
- Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore
- Use imperative mood (e.g. "add" not "added")
- Max 72 characters for the subject line
- Output ONLY the commit message text, nothing else`;

export type DiffEntry = {
  path: string;
  content: string;
};

export async function generateAiCommitMessage(diffs: DiffEntry[]): Promise<string> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("VITE_OPENROUTER_API_KEY ist nicht gesetzt");
  if (diffs.length === 0) throw new Error("Keine Diffs übergeben");

  const { aiPromptTemplate, aiOutputLanguage } = useCommitPrefs.getState();

  const basePrompt = aiPromptTemplate.trim() || DEFAULT_AI_PROMPT_TEMPLATE;
  const language = aiOutputLanguage.trim();
  const systemPrompt = language ? `${basePrompt}\n- Respond in: ${language}` : basePrompt;

  const diffText = diffs
    .map((d) => `### ${d.path}\n\`\`\`diff\n${d.content.slice(0, MAX_DIFF_CHARS)}\n\`\`\``)
    .join("\n\n");

  const client = new OpenRouter({ apiKey });

  const completion = await client.chat.send({
    chatRequest: {
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate a commit message for these staged changes:\n\n${diffText}` },
      ],
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (typeof content !== "string" || !content) throw new Error("Keine Antwort vom AI-Modell erhalten");
  return content.trim();
}
