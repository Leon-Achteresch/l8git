import { barcodePrompt } from "@/lib/agents/barcode-spec";
import { chartPrompt } from "@/lib/agents/chart-spec";
import { applyFileMentionsToTurn } from "./fileMentions";
import { applyNotesToTurn } from "./notes";
import {
  applySkillsToTurn,
  warmPiSkills,
  type SkillCatalogContext,
} from "./skills";

export async function preparePrompt(
  text: string,
  context: SkillCatalogContext,
): Promise<string> {
  warmPiSkills(context);
  const withFiles = await applyFileMentionsToTurn(applyRichCommands(text), context.cwd);
  const withNotes = await applyNotesToTurn(withFiles);
  return applySkillsToTurn(withNotes, context);
}

export function applyRichCommands(text: string): string {
  const match = /^\/(chart|barcode)\s+([\s\S]+)$/.exec(text.trim());
  if (!match) return text;
  return match[1] === "chart" ? chartPrompt(match[2]) : barcodePrompt(match[2]);
}
