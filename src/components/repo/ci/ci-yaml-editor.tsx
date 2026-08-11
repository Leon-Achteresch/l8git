import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { invoke } from "@tauri-apps/api/core";
import "@/lib/monaco-setup";
import { Editor } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import {
  CheckCircle2,
  FileCode2,
  Loader2,
  Save,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Monaco theme (mirrors git-hook-editor) ─────────────────────────────────

function useMonacoTheme() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains("dark")),
    );
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);
  return isDark ? "vs-dark" : "vs";
}

const EDITOR_OPTIONS: Monaco.editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  fontSize: 12,
  lineHeight: 18,
  renderLineHighlight: "line",
  overviewRulerBorder: false,
  folding: true,
  lineNumbers: "on",
  lineDecorationsWidth: 4,
  scrollbar: {
    vertical: "auto",
    horizontal: "auto",
    useShadows: false,
    verticalScrollbarSize: 4,
    horizontalScrollbarSize: 4,
  },
  wordWrap: "off",
  automaticLayout: true,
  tabSize: 2,
};

// ── Component ──────────────────────────────────────────────────────────────

export function CiYamlEditor({
  repoPath,
  initialFile,
}: {
  repoPath: string;
  /** Filename to pre-select, e.g. "release.yml" */
  initialFile: string | null;
}) {
  const theme = useMonacoTheme();

  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(initialFile);
  const [content, setContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = content !== originalContent;

  // Load available workflow files
  useEffect(() => {
    void (async () => {
      setLoadingFiles(true);
      try {
        const list = await invoke<string[]>("list_workflow_files", {
          path: repoPath,
        });
        setFiles(list);
        if (!selectedFile && list.length > 0) {
          setSelectedFile(list[0]);
        }
      } catch (e) {
        toastError(String(e));
      } finally {
        setLoadingFiles(false);
      }
    })();
  }, [repoPath, selectedFile]);

  // Load content when selected file changes
  useEffect(() => {
    if (!selectedFile) return;
    setLoadingContent(true);
    void invoke<string>("read_workflow_file", {
      path: repoPath,
      filename: selectedFile,
    })
      .then((c) => {
        setContent(c);
        setOriginalContent(c);
      })
      .catch((e) => toastError(String(e)))
      .finally(() => setLoadingContent(false));
  }, [repoPath, selectedFile]);

  const handleSave = useCallback(async () => {
    if (!selectedFile || !isDirty) return;
    setSaving(true);
    try {
      await invoke("save_workflow_file", {
        path: repoPath,
        filename: selectedFile,
        content,
      });
      setOriginalContent(content);
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      toastError(String(e));
    } finally {
      setSaving(false);
    }
  }, [repoPath, selectedFile, content, isDirty]);

  // Ctrl/Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  if (loadingFiles) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground/70">
        <FileCode2 className="h-8 w-8 opacity-40" />
        <p>No workflow files found in .github/workflows/</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        {/* File selector */}
        <div className="relative flex min-w-0 flex-1 items-center gap-1.5">
          <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
          <NativeSelect
            size="sm"
            className="min-w-0 flex-1"
            value={selectedFile ?? ""}
            onChange={(e) => setSelectedFile(e.target.value)}
          >
            {files.map((f) => (
              <NativeSelectOption key={f} value={f}>
                {f}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        {/* Dirty indicator */}
        {isDirty && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-git-modified" title="Unsaved changes" />
        )}

        {/* Save button */}
        <Button
          type="button"
          size="sm"
          variant={isDirty ? "default" : "ghost"}
          disabled={!isDirty || saving}
          onClick={() => void handleSave()}
          className="h-7 gap-1.5 px-2.5 text-xs"
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : saved ? (
            <CheckCircle2 className="h-3 w-3 text-git-added" />
          ) : (
            <Save className="h-3 w-3" />
          )}
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </Button>
      </div>

      {/* Editor */}
      <div className="min-h-0 flex-1">
        {loadingContent ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary/40" />
          </div>
        ) : (
          <Editor
            language="yaml"
            value={content}
            theme={theme}
            options={EDITOR_OPTIONS}
            onChange={(v) => setContent(v ?? "")}
          />
        )}
      </div>
    </div>
  );
}
