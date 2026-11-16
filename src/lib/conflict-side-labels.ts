import type { TFunction } from "i18next";
import type { RebaseStatus } from "./repo-store";

// Git keeps stage 2 = ours and stage 3 = theirs during a rebase. Only
// their user-facing roles change; HEAD can already include replayed commits.
export function conflictSideLabels(t: TFunction, rebase?: RebaseStatus) {
  const active = rebase?.in_progress === true;
  const prefix = active ? "mergeEditor.rebase" : "mergeEditor";
  const stopped = active ? rebase.stopped : null;
  const target = active ? rebase.onto_short ?? rebase.onto : null;
  return {
    oursHead: t(`${prefix}.oursHead`),
    theirsIncoming: stopped
      ? t("mergeEditor.rebase.theirsCommit", {
          commit: `${stopped.short_hash} · ${stopped.subject}`,
        })
      : t(`${prefix}.theirsIncoming`),
    ours: t(`${prefix}.ours`),
    theirs: t(`${prefix}.theirs`),
    takeOursHint: t(`${prefix}.takeOursHint`),
    takeTheirsHint: t(`${prefix}.takeTheirsHint`),
    allOurs: t(`${prefix}.allOurs`),
    allTheirs: t(`${prefix}.allTheirs`),
    acceptAllOursHint: t(`${prefix}.acceptAllOursHint`),
    acceptAllTheirsHint: t(`${prefix}.acceptAllTheirsHint`),
    explanation: active
      ? [t("mergeEditor.rebase.explanation"), target && t("mergeEditor.rebase.targetBase", { target })]
          .filter(Boolean).join(" ")
      : null,
  };
}
