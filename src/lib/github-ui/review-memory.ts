import { useEffect, useMemo, useState } from "react";

import { getReviewTreeState, reviewComparisonFingerprint, type ReviewTreeState } from "@/lib/github-expansion/api";
import { reviewProgress, subjectKey, useGithubWorkspace } from "@/lib/github-expansion/store";

import { isTarget, useGithubTarget } from "./target";

export type ReviewFile = { path: string; status: string; previous_path?: string | null; patch?: string };

/** Store key for an issue/PR: account-scoped on GitHub, path-scoped otherwise. */
export function useSubjectKey(path: string, kind: "issue" | "pull", number: number): string {
  const target = useGithubTarget(path);
  return useMemo(
    () => (isTarget(target) ? subjectKey(target.account, target.fullName, kind, number) : JSON.stringify(["local", path, kind, number])),
    [target, path, kind, number],
  );
}

/**
 * Persistent per-PR review memory. Fingerprints are GitHub's merge-base/head blob+mode pairs
 * (canonical `reviewComparisonFingerprint`): stable across unrelated rebases, invalidated when either
 * side of this file's comparison changes. Unavailable (truncated tree, non-GitHub) → cannot be marked.
 */
export function usePrReviewMemory(path: string, number: number, files: ReviewFile[] | null, pins: { head: string; base: string | null }) {
  const key = useSubjectKey(path, "pull", number);
  const target = useGithubTarget(path);
  const gh = isTarget(target) ? target : null;
  const snapshot = useGithubWorkspace((s) => s.reviews[key]);
  const subject = useGithubWorkspace((s) => s.subjects[key]);
  const markReviewed = useGithubWorkspace((s) => s.markReviewed);
  const unmarkReviewed = useGithubWorkspace((s) => s.unmarkReviewed);
  const updateSubject = useGithubWorkspace((s) => s.updateSubject);
  const [state, setState] = useState<ReviewTreeState | null | "error">(null);

  useEffect(() => {
    setState(null);
    if (!gh || !pins.head || !pins.base) return;
    let live = true;
    getReviewTreeState(gh.account, gh.fullName, pins.base, pins.head).then((s) => live && setState(s), () => live && setState("error"));
    return () => {
      live = false;
    };
  }, [gh?.account, gh?.fullName, pins.head, pins.base]); // eslint-disable-line react-hooks/exhaustive-deps

  const prints = useMemo(() => {
    if (!files || !state || state === "error") return null;
    return new Map(files.map((f) => [f.path, reviewComparisonFingerprint(state, f.path, f.previous_path)] as const));
  }, [files, state]);

  const progress = useMemo(() => {
    if (!prints) return null;
    const known = [...prints].filter((e): e is [string, string] => e[1] !== null);
    return { ...reviewProgress(snapshot, known.map(([p, fingerprint]) => ({ path: p, fingerprint }))), unavailable: [...prints].filter(([, v]) => v === null).map(([p]) => p) };
  }, [prints, snapshot]);

  return {
    ready: !!prints,
    unavailable: state === "error" || (state !== null && !state.complete),
    progress,
    hadPriorReview: !!snapshot,
    lastReviewedAt: snapshot?.reviewedAt ?? null,
    statusOf: (p: string): "reviewed" | "changed" | "unseen" | "unavailable" | null =>
      !progress ? null : progress.unavailable.includes(p) ? "unavailable" : progress.reviewed.includes(p) ? "reviewed" : progress.changed.includes(p) ? "changed" : "unseen",
    toggle: (p: string) => {
      const fp = prints?.get(p);
      if (!fp) return;
      if (snapshot?.files[p] === fp) unmarkReviewed(key, p);
      else markReviewed(key, pins.head, p, fp);
    },
    position: subject?.position ?? null,
    savePosition: (file: string) => updateSubject(key, { position: { file } }),
  };
}
