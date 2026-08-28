import { lazy, Suspense } from "react";

import { useEverTrue } from "@/lib/use-ever-true";

// Both dialogs are mounted from three places that are all on screen at
// startup, so importing them directly would put the clone form — the largest
// of the two — into the startup chunk for every user, opened or not.
const CloneRepoDialog = lazy(() =>
  import("./clone-repo-dialog").then((m) => ({ default: m.CloneRepoDialog })),
);
const InitRepoDialog = lazy(() =>
  import("./init-repo-dialog").then((m) => ({ default: m.InitRepoDialog })),
);

export function RepoSourceDialogs({
  cloneOpen,
  initOpen,
  onCloseClone,
  onCloseInit,
}: {
  cloneOpen: boolean;
  initOpen: boolean;
  onCloseClone: () => void;
  onCloseInit: () => void;
}) {
  const cloneUsed = useEverTrue(cloneOpen);
  const initUsed = useEverTrue(initOpen);
  if (!cloneUsed && !initUsed) return null;

  return (
    <Suspense fallback={null}>
      {cloneUsed ? <CloneRepoDialog open={cloneOpen} onClose={onCloseClone} /> : null}
      {initUsed ? <InitRepoDialog open={initOpen} onClose={onCloseInit} /> : null}
    </Suspense>
  );
}
