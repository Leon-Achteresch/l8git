export type SubmodulePins = { before: string; after: string };

export type SubmodulePinDiff =
  | { status: "samePin" }
  | { status: "diff"; patch: string; truncated: boolean };

/** Read the pair from Git's original short-format, single-gitlink patch. */
export function submodulePins(patch: string | null): SubmodulePins | null {
  if (!patch?.startsWith("diff --git ")) return null;
  const hunk = patch.indexOf("\n@@ ");
  if (hunk < 0) return null;
  const header = patch.slice(0, hunk);
  const index = header.match(/^index ([a-f0-9]+)\.\.([a-f0-9]+) 160000$/m);
  const pins = patch.slice(hunk + 1).match(
    /^@@ -1(?:,1)? \+1(?:,1)? @@\n-Subproject commit ([a-f0-9]{40}|[a-f0-9]{64})\n\+Subproject commit ([a-f0-9]{40}|[a-f0-9]{64})(-dirty)?\n?$/,
  );
  if (!pins) return null;
  const [, before, after, dirty] = pins;
  if (before.length !== after.length) return null;
  if (index) {
    if (!before.startsWith(index[1]) || !after.startsWith(index[2])) return null;
  } else if (!dirty || before !== after || /^(?:index |old mode |new mode |new file mode |deleted file mode )/m.test(header)) {
    // Git omits the index header when only the checkout's dirty state changed.
    return null;
  }
  return { before, after };
}
