import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

import {
  isMissingPathError,
  parseFileTooLarge,
  type LfsPointerInfo,
  type MediaFileBytes,
} from "./media";

export type MediaTreeish = string | null;

export type MediaFileState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; file: MediaFileBytes; treeish: MediaTreeish }
  | { status: "tooLarge"; size: number }
  | { status: "missing" }
  | { status: "error"; message: string };

const IDLE: MediaFileState = { status: "idle" };

function normalizeCandidates(
  candidates: MediaTreeish | readonly MediaTreeish[],
): MediaTreeish[] {
  if (Array.isArray(candidates)) return [...candidates];
  return [candidates as MediaTreeish];
}

export function useMediaFile(
  repoPath: string | null | undefined,
  filePath: string | null | undefined,
  candidates: MediaTreeish | readonly MediaTreeish[],
  enabled = true,
): MediaFileState {
  const [state, setState] = useState<MediaFileState>(IDLE);
  const candidateKey = JSON.stringify(normalizeCandidates(candidates));

  useEffect(() => {
    if (!enabled || !repoPath || !filePath) {
      setState(IDLE);
      return;
    }
    const list = JSON.parse(candidateKey) as MediaTreeish[];
    if (list.length === 0) {
      setState(IDLE);
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      let lastError: unknown = null;
      for (const treeish of list) {
        try {
          const file = await invoke<MediaFileBytes>("repo_file_bytes_at", {
            path: repoPath,
            treeish,
            filePath,
          });
          if (cancelled) return;
          setState({ status: "ready", file, treeish });
          return;
        } catch (e) {
          const tooLarge = parseFileTooLarge(e);
          if (tooLarge != null) {
            if (!cancelled) setState({ status: "tooLarge", size: tooLarge });
            return;
          }
          lastError = e;
        }
      }
      if (cancelled) return;
      if (isMissingPathError(lastError)) {
        setState({ status: "missing" });
        return;
      }
      setState({ status: "error", message: String(lastError ?? "") });
    })();
    return () => {
      cancelled = true;
    };
  }, [repoPath, filePath, candidateKey, enabled]);

  return state;
}

export type LfsPointerState = {
  loading: boolean;
  pointer: LfsPointerInfo | null;
};

const NO_POINTER: LfsPointerState = { loading: false, pointer: null };

export function useLfsPointer(
  repoPath: string | null | undefined,
  filePath: string | null | undefined,
  treeish: MediaTreeish,
  enabled = true,
): LfsPointerState {
  const [state, setState] = useState<LfsPointerState>(NO_POINTER);

  useEffect(() => {
    if (!enabled || !repoPath || !filePath) {
      setState(NO_POINTER);
      return;
    }
    let cancelled = false;
    setState({ loading: true, pointer: null });
    invoke<LfsPointerInfo>("lfs_pointer_info", {
      path: repoPath,
      filePath,
      treeish,
    })
      .then((pointer) => {
        if (!cancelled) setState({ loading: false, pointer });
      })
      .catch(() => {
        if (!cancelled) setState(NO_POINTER);
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath, filePath, treeish, enabled]);

  return state;
}
