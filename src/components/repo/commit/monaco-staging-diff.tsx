import { Button } from "@/components/ui/button";
import "@/lib/monaco-setup";
import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { findBackendError } from "@/lib/backend-error";
import { toastError, translateKnownError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
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
  return isDark ? "l8-dark" : "l8-light";
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
  originalFilePath,
  onSaved,
}: {
  repoPath: string;
  filePath: string;
  originalFilePath: string;
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

  const unborn = useRepoStore(s => s.repos[repoPath]?.is_unborn === true);
  const [source, setSource] = useState<{ original: string; modified: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequest = useRef(0);
  const [isDirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [diskReview, setDiskReview] = useState<{ state: "changed" | "reading" } | { state: "review"; content: string } | null>(null);
  const needsDiskReview = useRef(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const modifiedEditorRef = useRef<Monaco.editor.ITextModel | null>(null);

  const savedVersion = useRef(0);
  const lastSavedContent = useRef("");
  const savingRef = useRef(false);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => () => {
    modifiedEditorRef.current = null;
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);

  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    setSource(null);
    setLoadError(null);
    setDiskReview(null);
    needsDiskReview.current = false;
    try {
      const [original, modified] = await Promise.all([
        unborn ? Promise.resolve("") : invoke<string>("repo_file_content_at", { path: repoPath, file: originalFilePath, treeish: "HEAD" }),
        invoke<string>("repo_read_file", { path: repoPath, file: filePath }),
      ]);
      if (request === loadRequest.current) {
        lastSavedContent.current = modified;
        setSource({ original, modified });
      }
    } catch (e) {
      if (request === loadRequest.current) setLoadError(String(e));
    }
  }, [repoPath, filePath, originalFilePath, unborn]);

  useEffect(() => {
    void load();
    return () => { loadRequest.current += 1; };
  }, [load]);

  const save = useCallback(async () => {
    const model = modifiedEditorRef.current;
    if (!model || model.isDisposed() || savingRef.current || needsDiskReview.current) return;
    const version = model.getAlternativeVersionId();
    if (version === savedVersion.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const content = model.getValue(undefined, true);
      await invoke("repo_write_file", { path: repoPath, file: filePath, content, expected: { content: lastSavedContent.current } });
      if (modifiedEditorRef.current !== model || model.isDisposed()) return;
      lastSavedContent.current = content;
      setDiskReview(null);
      savedVersion.current = version;
      const stillDirty = model.getAlternativeVersionId() !== version;
      setDirty(stillDirty);
      setSavedFlash(!stillDirty);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedFlash(false), 2000);
      onSavedRef.current?.();
    } catch (e) {
      if (modifiedEditorRef.current !== model || model.isDisposed()) return;
      if (findBackendError(e).code === "fs.fileChangedMeanwhile") {
        needsDiskReview.current = true;
        setDiskReview({ state: "changed" });
      } else toastError(String(e));
    } finally {
      savingRef.current = false;
      if (modifiedEditorRef.current === model) setSaving(false);
    }
  }, [repoPath, filePath]);

  async function compareDisk() {
    const model = modifiedEditorRef.current;
    if (!model || model.isDisposed() || diskReview?.state !== "changed") return;
    setDiskReview({ state: "reading" });
    try {
      const disk = await invoke<string>("repo_read_file", { path: repoPath, file: filePath });
      if (modifiedEditorRef.current !== model || model.isDisposed()) return;
      const matches = model.getValue(undefined, true) === disk;
      lastSavedContent.current = disk;
      savedVersion.current = matches ? model.getAlternativeVersionId() : 0;
      needsDiskReview.current = false;
      setDirty(!matches);
      setDiskReview(matches ? null : { state: "review", content: disk });
    } catch (e) {
      if (modifiedEditorRef.current !== model || model.isDisposed()) return;
      setDiskReview({ state: "changed" });
      toastError(String(e));
    }
  }

  const handleMount: DiffOnMount = useCallback((editor, monaco) => {
    const modifiedEditor = editor.getModifiedEditor();
    const model = modifiedEditor.getModel();
    if (!model) return;
    modifiedEditorRef.current = model;
    savedVersion.current = model.getAlternativeVersionId();
    setDirty(false);
    model.onDidChangeContent(() => {
      setDirty(model.getAlternativeVersionId() !== savedVersion.current);
      setSavedFlash(false);
    });
    modifiedEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void save());
  }, [save]);

  if (loadError !== null) {
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm">
        <p>{t("commitPanel.diffLoadFailed")}</p>
        <p className="break-all text-xs text-muted-foreground">{translateKnownError(loadError)}</p>
        <Button size="sm" variant="outline" onClick={() => void load()}>{t("common.retry")}</Button>
      </div>
    );
  }

  if (!source) {
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
          disabled={!isDirty || saving || !!diskReview && diskReview.state !== "review"}
          onClick={() => void save()}
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

      {diskReview && (
        <div role="status" className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
          <span className="flex-1">{t(diskReview.state === "review" ? "commitPanel.editFileCompareReady" : "commitPanel.editFileDiskChanged")}</span>
          {diskReview.state !== "review" && (
            <Button size="sm" variant="outline" disabled={diskReview.state === "reading"} onClick={() => void compareDisk()}>
              {t("commitPanel.editFileCompareDisk")}
            </Button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <DiffEditor
          language={language}
          original={diskReview?.state === "review" ? diskReview.content : source.original}
          modified={source.modified}
          theme={theme}
          options={options}
          onMount={handleMount}
        />
      </div>
    </div>
  );
}
