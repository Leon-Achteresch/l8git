import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { hasUnresolvedConflicts } from "@/lib/conflict-parser";
import type { ConflictVersions } from "@/lib/repo-store";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  GitCommit,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";

const MergeEditor3Way = lazy(() =>
  import("./merge-editor-3way").then((m) => ({ default: m.MergeEditor3Way })),
);
const MergeEditor2Way = lazy(() =>
  import("./merge-editor-2way").then((m) => ({ default: m.MergeEditor2Way })),
);

// Language detection (subset, mirrors monaco-diff-viewer.tsx)
const EXT_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  rs: "rust", py: "python", go: "go", java: "java", kt: "kotlin",
  swift: "swift", c: "c", cpp: "cpp", cs: "csharp", css: "css",
  scss: "scss", html: "html", xml: "xml", json: "json", yaml: "yaml",
  yml: "yaml", toml: "toml", md: "markdown", sh: "shell", sql: "sql",
  graphql: "graphql", proto: "protobuf", dart: "dart", lua: "lua",
  vue: "html", svelte: "html", php: "php", tf: "hcl", rb: "ruby",
};

function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? "plaintext";
}

type Mode = "3way" | "2way";

interface FileState {
  versions: ConflictVersions | null;
  loading: boolean;
  resolved: boolean;
}

export function MergeConflictPage({
  path,
  onClose,
}: {
  path: string;
  onClose: () => void;
}) {
  const mergeState = useRepoStore((s) => s.mergeState[path]);
  const conflictedFiles = mergeState?.conflicted_paths ?? [];

  const [mode, setMode] = useState<Mode>("3way");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileStates, setFileStates] = useState<Record<string, FileState>>({});
  const [saving, setSaving] = useState(false);
  const [committing, setCommitting] = useState(false);

  // Ensure merge state is loaded (e.g. when opened directly from commit panel
  // before the history-panel banner has had a chance to call reloadMergeState).
  useEffect(() => {
    void useRepoStore.getState().reloadMergeState(path);
  }, [path]);

  // Auto-select the first conflicted file once the list becomes available.
  useEffect(() => {
    if (selectedFile === null && conflictedFiles.length > 0) {
      setSelectedFile(conflictedFiles[0] ?? null);
    }
  }, [conflictedFiles, selectedFile]);

  // Load versions when file changes
  useEffect(() => {
    if (!selectedFile) return;
    const existing = fileStates[selectedFile];
    if (existing?.versions || existing?.loading) return;

    setFileStates((prev) => ({
      ...prev,
      [selectedFile]: { versions: null, loading: true, resolved: false },
    }));

    useRepoStore
      .getState()
      .mergeGetConflictVersions(path, selectedFile)
      .then((versions) => {
        const resolved = !hasUnresolvedConflicts(versions.current);
        setFileStates((prev) => ({
          ...prev,
          [selectedFile]: { versions, loading: false, resolved },
        }));
      })
      .catch((err) => {
        toastError(String(err));
        setFileStates((prev) => ({
          ...prev,
          [selectedFile]: { versions: null, loading: false, resolved: false },
        }));
      });
  }, [selectedFile, path, fileStates]);

  const handleSave = useCallback(
    async (content: string) => {
      if (!selectedFile) return;
      setSaving(true);
      try {
        await useRepoStore.getState().mergeSaveResolved(path, selectedFile, content);
        toast.success("Datei gespeichert und gestaged.");
        setFileStates((prev) => ({
          ...prev,
          [selectedFile]: {
            ...prev[selectedFile],
            resolved: true,
          },
        }));
      } catch (err) {
        toastError(String(err));
      } finally {
        setSaving(false);
      }
    },
    [selectedFile, path],
  );

  async function handleCommit() {
    setCommitting(true);
    try {
      await useRepoStore.getState().mergeCommit(path);
      toast.success("Merge-Commit erstellt.");
      onClose();
    } catch (err) {
      toastError(String(err));
    } finally {
      setCommitting(false);
    }
  }

  const allResolved =
    conflictedFiles.length > 0 &&
    conflictedFiles.every((f) => fileStates[f]?.resolved);

  const current = selectedFile ? fileStates[selectedFile] : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          title="Schließen"
        >
          <X className="h-4 w-4" />
        </Button>
        <span className="font-medium">Merge-Konflikte auflösen</span>
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
          {conflictedFiles.length} Datei{conflictedFiles.length !== 1 ? "en" : ""}
        </span>

        {/* Mode toggle */}
        <div className="ml-4 flex rounded-md border border-border text-xs font-medium">
          <button
            type="button"
            onClick={() => setMode("3way")}
            className={cn(
              "rounded-l-md px-3 py-1 transition-colors",
              mode === "3way"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent/50",
            )}
          >
            3-Weg
          </button>
          <button
            type="button"
            onClick={() => setMode("2way")}
            className={cn(
              "rounded-r-md border-l border-border px-3 py-1 transition-colors",
              mode === "2way"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent/50",
            )}
          >
            2-Weg
          </button>
        </div>

        <Button
          type="button"
          size="sm"
          className="ml-auto"
          disabled={!allResolved || committing}
          onClick={() => void handleCommit()}
          title={!allResolved ? "Alle Konflikte zuerst auflösen und speichern" : undefined}
        >
          <GitCommit className="mr-1 h-3.5 w-3.5" />
          {committing ? "…" : "Merge-Commit erstellen"}
        </Button>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* File sidebar */}
        <aside className="flex w-56 flex-shrink-0 flex-col border-r border-border bg-card">
          <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
            Konfliktdateien
          </div>
          <ul className="flex-1 overflow-y-auto py-1">
            {conflictedFiles.map((file) => {
              const state = fileStates[file];
              const isSelected = file === selectedFile;
              return (
                <li key={file}>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(file)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
                      isSelected
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/50",
                    )}
                    title={file}
                  >
                    {state?.resolved ? (
                      <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                    )}
                    <span className="truncate font-mono">{file.split("/").pop()}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Editor area */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!selectedFile ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <FileCode2 className="h-8 w-8 opacity-40" />
              <span className="text-sm">Wähle links eine Datei aus</span>
            </div>
          ) : current?.loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
            </div>
          ) : current?.versions ? (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
                </div>
              }
            >
              {mode === "3way" ? (
                <MergeEditor3Way
                  key={`3way-${selectedFile}`}
                  versions={current.versions}
                  language={detectLanguage(selectedFile)}
                  onSave={(content) => void handleSave(content)}
                  saving={saving}
                />
              ) : (
                <MergeEditor2Way
                  key={`2way-${selectedFile}`}
                  versions={current.versions}
                  language={detectLanguage(selectedFile)}
                  onSave={(content) => void handleSave(content)}
                  saving={saving}
                />
              )}
            </Suspense>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Datei konnte nicht geladen werden.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
