import { gitExpansion, type CommandSpec } from "@/lib/git-expansion";

/** Backend caps: 500 files, 1 MiB each, 8 MiB total, regular files only. */
export const SOURCE_FILES_CAP = 500;

export const sourceFiles = (path: string, files: string[], expectedHead: string) =>
  gitExpansion(path, { op: "source_files", files, expectedHead });

/** `worktreePath` must be a registered agent worktree; the command runs in place against its dirty content. */
export const evidenceRun = (
  worktreePath: string,
  request: { basePath: string; expectedBaseHead: string; expectedHead: string; expectedFingerprint: string; command: CommandSpec; confirmed: boolean },
) => gitExpansion(worktreePath, { op: "evidence_run", ...request });
