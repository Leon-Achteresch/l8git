export type ConflictBlock = {
  index: number;
  startLine: number;
  endLine: number;
  oursLines: string[];
  theirsLines: string[];
  oursLabel: string;
  theirsLabel: string;
};

export function parseConflictBlocks(text: string): ConflictBlock[] {
  const lines = text.split("\n");
  const blocks: ConflictBlock[] = [];
  let i = 0;
  let blockIndex = 0;

  while (i < lines.length) {
    if (lines[i].startsWith("<<<<<<<")) {
      const startLine = i;
      const oursLabel = lines[i].slice(8).trim();
      const oursLines: string[] = [];
      const theirsLines: string[] = [];
      let inOurs = true;
      let endLine = i;
      i++;

      while (i < lines.length) {
        if (lines[i].startsWith("=======")) {
          inOurs = false;
          i++;
          continue;
        }
        if (lines[i].startsWith(">>>>>>>")) {
          endLine = i;
          break;
        }
        if (lines[i].startsWith("|||||||")) {
          // diff3 base section — skip it
          inOurs = false;
          i++;
          while (i < lines.length && !lines[i].startsWith("=======")) {
            i++;
          }
          inOurs = false;
          continue;
        }
        if (inOurs) {
          oursLines.push(lines[i]);
        } else {
          theirsLines.push(lines[i]);
        }
        i++;
      }

      const theirsLabel = lines[endLine]?.slice(8).trim() ?? "";
      blocks.push({
        index: blockIndex++,
        startLine,
        endLine,
        oursLines,
        theirsLines,
        oursLabel,
        theirsLabel,
      });
    }
    i++;
  }

  return blocks;
}

export function resolveConflict(
  text: string,
  block: ConflictBlock,
  choice: "ours" | "theirs" | "both",
): string {
  const lines = text.split("\n");
  const replacement =
    choice === "ours"
      ? block.oursLines
      : choice === "theirs"
        ? block.theirsLines
        : [...block.oursLines, ...block.theirsLines];

  const before = lines.slice(0, block.startLine);
  const after = lines.slice(block.endLine + 1);
  return [...before, ...replacement, ...after].join("\n");
}

export function hasUnresolvedConflicts(text: string): boolean {
  return text.includes("<<<<<<<");
}
