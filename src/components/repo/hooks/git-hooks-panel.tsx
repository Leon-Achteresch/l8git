import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { writeLocalStorageDebounced } from "@/lib/utils";
import { useEffect, useState } from "react";
import { GitHooksDetail } from "./git-hooks-detail";
import { GitHooksList } from "./git-hooks-list";

const layoutStorageKey = "l8git.hooks-split.layout.v1";

const HOOK_TEMPLATES: Record<string, string> = {
  "pre-commit": `#!/bin/sh
# pre-commit: Wird vor dem Commit ausgeführt.
# Exit-Code ≠ 0 bricht den Commit ab.

set -e

echo "pre-commit: Prüfungen laufen…"

# Beispiel: Keine debug-Ausgaben erlauben
# if git diff --cached | grep -q "console.log"; then
#   echo "Fehler: console.log gefunden!" >&2
#   exit 1
# fi

exit 0
`,
  "commit-msg": `#!/bin/sh
# commit-msg: Validiert die Commit-Nachricht.
# $1 = Pfad zur Datei mit der Commit-Nachricht
# Exit-Code ≠ 0 bricht den Commit ab.

MSG_FILE="$1"
MSG=$(cat "$MSG_FILE")

# Beispiel: Mindestlänge prüfen
if [ \${#MSG} -lt 10 ]; then
  echo "Fehler: Commit-Nachricht zu kurz (min. 10 Zeichen)" >&2
  exit 1
fi

exit 0
`,
  "pre-push": `#!/bin/sh
# pre-push: Wird vor dem Push ausgeführt.
# Exit-Code ≠ 0 bricht den Push ab.
# stdin: <lokale-ref> <lokaler-sha> <remote-ref> <remote-sha>

set -e

echo "pre-push: Überprüfungen laufen…"

exit 0
`,
  "post-commit": `#!/bin/sh
# post-commit: Wird nach einem erfolgreichen Commit ausgeführt.
# Kann den Commit nicht abbrechen.

echo "post-commit: Commit erfolgreich erstellt."
`,
  "prepare-commit-msg": `#!/bin/sh
# prepare-commit-msg: Wird vor dem Öffnen des Editors ausgeführt.
# $1 = Datei mit Nachricht, $2 = Typ, $3 = Commit-SHA (bei --amend)

MSG_FILE="$1"
# MSG_TYPE="$2"   # message | template | merge | squash | commit

# Beispiel: Branch-Name automatisch einfügen
# BRANCH=$(git rev-parse --abbrev-ref HEAD)
# sed -i.bak -e "1s/^/[$BRANCH] /" "$MSG_FILE"

exit 0
`,
};

function getHookTemplate(name: string): string {
  return (
    HOOK_TEMPLATES[name] ??
    `#!/bin/sh
# ${name}: Git-Hook
# Referenz: https://git-scm.com/docs/githooks

set -e

exit 0
`
  );
}

export function GitHooksPanel({ path }: { path: string }) {
  const reloadGitHooks = useRepoStore((s) => s.reloadGitHooks);
  const gitHooksForPath = useRepoStore((s) => s.gitHooks[path]) ?? [];

  const [selectedHookName, setSelectedHookName] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [isContentLoading, setIsContentLoading] = useState(false);

  const [defaultLayout] = useState<Record<string, number> | undefined>(() => {
    const raw = localStorage.getItem(layoutStorageKey);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as Record<string, number>;
    } catch {
      return undefined;
    }
  });

  useEffect(() => {
    void reloadGitHooks(path);
  }, [path, reloadGitHooks]);

  useEffect(() => {
    setSelectedHookName(null);
  }, [path]);

  useEffect(() => {
    if (!selectedHookName) {
      setEditorContent("");
      return;
    }
    // Read current state imperatively — avoids making gitHooks a dep and
    // triggering this effect every time reloadGitHooks refreshes the list.
    const entry = useRepoStore
      .getState()
      .gitHooks[path]?.find((h) => h.name === selectedHookName);
    if (!entry?.exists) {
      setEditorContent(getHookTemplate(selectedHookName));
      return;
    }
    setIsContentLoading(true);
    useRepoStore
      .getState()
      .getGitHookContent(path, selectedHookName)
      .then((content) => setEditorContent(content))
      .catch((e) => toastError(String(e)))
      .finally(() => setIsContentLoading(false));
  }, [selectedHookName, path]);

  const selectedEntry = selectedHookName
    ? (gitHooksForPath.find((h) => h.name === selectedHookName) ?? null)
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {selectedEntry ? (
        <ResizablePanelGroup
          orientation="horizontal"
          id="hooks-split"
          defaultLayout={defaultLayout}
          onLayoutChanged={(layout) =>
            writeLocalStorageDebounced(
              layoutStorageKey,
              JSON.stringify(layout),
            )
          }
        >
          <ResizablePanel
            id="hooks-list"
            defaultSize="40%"
            minSize="24%"
            maxSize="65%"
            className="flex min-h-0 flex-col"
          >
            <GitHooksList
              path={path}
              selectedHookName={selectedHookName}
              onSelectHook={setSelectedHookName}
            />
          </ResizablePanel>
          <ResizableHandle
            withHandle
            className="bg-border/50 transition-colors hover:bg-primary/20"
          />
          <ResizablePanel
            id="hooks-detail"
            defaultSize="60%"
            minSize="30%"
            className="flex min-h-0 flex-col"
          >
            {isContentLoading ? (
              <div className="flex h-full items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
              </div>
            ) : (
              <GitHooksDetail
                path={path}
                entry={selectedEntry}
                editorContent={editorContent}
                onEditorChange={setEditorContent}
                onClose={() => setSelectedHookName(null)}
              />
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <GitHooksList
            path={path}
            selectedHookName={selectedHookName}
            onSelectHook={setSelectedHookName}
          />
        </div>
      )}
    </div>
  );
}
