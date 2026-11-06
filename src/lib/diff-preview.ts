import { invoke } from "@/lib/platform/ipc";

export interface DiffPreviewRequest {
  kind: "staged" | "unstaged" | "compare" | "merge-base" | "commit";
  file: string;
  previousFile?: string;
  base?: string;
  head?: string;
  ignoreWhitespace: boolean;
  colorMoved: boolean;
  context: number;
}

export interface DiffPreviewResponse {
  patch: string;
  /** Zero-based indices into patch.split('\n'), never source line numbers. */
  movedLines: number[];
  truncated: boolean;
  binary: boolean;
  baseSha: string | null;
  headSha: string | null;
}

/** Display only: original guarded patches remain authoritative for staging/discard. */
export function loadDiffPreview(path: string, request: DiffPreviewRequest): Promise<DiffPreviewResponse> {
  return invoke("repo_diff_preview", { path, request });
}
