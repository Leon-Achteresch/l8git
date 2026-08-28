import { Button } from "@/components/ui/button";
import "@/lib/monaco-setup";
import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toastError } from "@/lib/error-toast";
import { resolveTheme, getStoredTheme } from "@/lib/theme";
import { useCommitPrefs } from "@/lib/commit-prefs";
import { DiffLayoutToggle } from "./diff-layout-toggle";
import { SpinIcon } from "@/components/motion/kit";

const EXT_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescript",
  js: "javascript", jsx: "javascript",
  rs: "rust", py: "python", rb: "ruby", go: "go",
  java: "java", kt: "kotlin", swift: "swift",
  c: "c", cpp: "cpp", cc: "cpp", h: "cpp", cs: "csharp",
  css: "css", scss: "scss", less: "less",
  html: "html", htm: "html", xml: "xml",
  json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
  md: "markdown", mdx: "markdown",
  sh: "shell", bash: "shell", zsh: "shell",
  sql: "sql", graphql: "graphql", gql: "graphql",
  proto: "protobuf", dart: "dart", lua: "lua", r: "r",
  vue: "html", svelte: "html", php: "php", tf: "hcl",
};

function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? "plaintext";
}

function useMonacoTheme() {
  const [isDark, setIsDark] = useState<boolean>(
    () => resolveTheme(getStoredTheme()) === "dark",
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains("dark")),
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark ? "vs-dark" : "vs";
}

const BASE_OPTIONS: Monaco.editor.IDiffEditorConstructionOptions = {
  renderSideBySide: false,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  fontSize: 12,
  lineHeight: 18,
  renderLineHighlight: "line",
  overviewRulerBorder: false,
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  folding: false,
  glyphMargin: false,
  lineNumbers: "on",
  lineDecorationsWidth: 4,
  scrollbar: {
    vertical: "auto",
    horizontal: "auto",
    useShadows: false,
    verticalScrollbarSize: 3,
    horizontalScrollbarSize: 3,
  },
  wordWrap: "off",
  automaticLayout: true,
  renderOverviewRuler: false,
  ignoreTrimWhitespace: false,
  diffAlgorithm: "advanced",
  hideUnchangedRegions: {
    enabled: true,
    minimumLineCount: 3,
    contextLineCount: 3,
  },
};

export function MonacoStagingDiff({
  repoPath,
  filePath,
  onSaved,
}: {
  repoPath: string;
  filePath: string;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const theme = useMonacoTheme();
  const language = detectLanguage(filePath);
  const layoutMode = useCommitPrefs((s) => s.diffLayoutMode);
  const options = useMemo<Monaco.editor.IDiffEditorConstructionOptions>(
    () => ({ ...BASE_OPTIONS, renderSideBySide: layoutMode === "sideBySide" }),
    [layoutMode],
  );

  const [original, setOriginal] = useState<string>("");
  const [modified, setModified] = useState<string>("");
  const [savedModified, setSavedModified] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const modifiedEditorRef = useRef<Monaco.editor.ITextModel | null>(null);

  const isDirty = modified !== savedModified;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      invoke<string>("repo_file_content_at", { path: repoPath, file: filePath, treeish: "HEAD" }).catch(() => ""),
      invoke<string>("repo_read_file", { path: repoPath, file: filePath }).catch(() => ""),
    ]).then(([orig, mod]) => {
      if (cancelled) return;
      setOriginal(orig);
      setModified(mod);
      setSavedModified(mod);
    }).catch((e) => {
      if (!cancelled) toastError(String(e));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [repoPath, filePath]);

  const handleMount: DiffOnMount = useCallback((_editor, monaco) => {
    const modEditor = _editor.getModifiedEditor();
    modifiedEditorRef.current = modEditor.getModel();
    modEditor.onDidChangeModelContent(() => {
      const val = modEditor.getValue();
      setModified(val);
    });
    modEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void doSave(modEditor.getValue());
    });
  }, []);

  const doSave = useCallback(async (content: string) => {
    setSaving(true);
    try {
      await invoke("repo_write_file", { path: repoPath, file: filePath, content });
      setSavedModified(content);
      setSavedFlash(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedFlash(false), 2000);
      onSaved?.();
    } catch (e) {
      toastError(String(e));
    } finally {
      setSaving(false);
    }
  }, [repoPath, filePath, onSaved]);

  const handleSave = useCallback(() => {
    const current = modifiedEditorRef.current?.getValue() ?? modified;
    void doSave(current);
  }, [doSave, modified]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <SpinIcon icon={Loader2} className="h-5 w-5 text-primary/40" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border/60 px-3 py-1">
        <DiffLayoutToggle className="mr-auto" />
        {isDirty && (
          <span className="h-1.5 w-1.5 rounded-full bg-git-modified" />
        )}
        <Button
          type="button"
          variant={isDirty && !saving ? "default" : "ghost"}
          size="sm"
          disabled={!isDirty || saving}
          onClick={handleSave}
        >
          {saving ? (
            <SpinIcon icon={Loader2} className="h-3 w-3" />
          ) : savedFlash ? (
            <CheckCircle2 className="h-3 w-3 text-git-added" />
          ) : (
            <Save className="h-3 w-3" />
          )}
          {saving
            ? t("commitPanel.editFileSaving")
            : savedFlash
              ? t("commitPanel.editFileSaved")
              : t("commitPanel.editFileSave")}
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <DiffEditor
          language={language}
          original={original}
          modified={modified}
          theme={theme}
          options={options}
          onMount={handleMount}
        />
      </div>
    </div>
  );
}
