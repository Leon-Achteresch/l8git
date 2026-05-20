export type ConflictBlock = {
  index: number;
  startLine: number;
  endLine: number;
  separatorLine: number;
  oursStartLine: number;
  oursEndLine: number;
  theirsStartLine: number;
  theirsEndLine: number;
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
      const oursStartLine = i + 1;
      let oursEndLine = i;
      let theirsStartLine = i;
      let separatorLine = i;
      let inOurs = true;
      let endLine = i;
      i++;

      while (i < lines.length) {
        if (lines[i].startsWith("=======")) {
          if (inOurs) {
            oursEndLine = i - 1;
          }
          separatorLine = i;
          theirsStartLine = i + 1;
          inOurs = false;
          i++;
          continue;
        }
        if (lines[i].startsWith(">>>>>>>")) {
          endLine = i;
          break;
        }
        if (lines[i].startsWith("|||||||")) {
          oursEndLine = i - 1;
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

      const theirsEndLine = endLine - 1;
      const theirsLabel = lines[endLine]?.slice(8).trim() ?? "";
      blocks.push({
        index: blockIndex++,
        startLine,
        endLine,
        separatorLine,
        oursStartLine,
        oursEndLine,
        theirsStartLine,
        theirsEndLine,
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
