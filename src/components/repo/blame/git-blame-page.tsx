import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app/app-header";
import { translateKnownError } from "@/lib/error-toast";
import "@/lib/monaco-setup";
import { Editor } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { invoke } from "@tauri-apps/api/core";
import type { BlameEntry } from "./git-blame-sheet";
import { FileClock, GitCommitHorizontal, Loader2, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BlameGutter } from "./blame-gutter";
import { type ActiveCard, CommitCard } from "./commit-card";
import { BlameFileTree } from "./file-tree-node";
import { detectLanguage, EDITOR_OPTIONS } from "./git-blame-utils";
import { useMonacoTheme } from "./use-monaco-theme";
import { SpinIcon } from "@/components/motion/kit";

type GitBlamePageProps = {
  path: string;
  initialFile: string | null;
  initialSearch?: string;
  onClose: () => void;
};

const EMPTY_BLAME: BlameEntry[] = [];

function useBlameRead<T>(read: () => Promise<T>) {
  const sequence = useRef(0);
  const [result, setResult] = useState<{ read: typeof read; value?: T; error?: string }>();
  const retry = useCallback(() => {
    const request = ++sequence.current;
    setResult(undefined);
    void read().then(value => {
      if (sequence.current === request) setResult({ read, value });
    }, error => {
      if (sequence.current === request) setResult({ read, error: String(error) });
    });
  }, [read]);
  useEffect(() => {
    retry();
    return () => { sequence.current++; };
  }, [retry]);
  const current = result?.read === read ? result : undefined;
  return { value: current?.value, error: current?.error, loading: !current, retry };
}

function BlameReadError({ error, retry }: { error: string; retry: () => void }) {
  const { t } = useTranslation();
  return <div role="alert" className="flex flex-col items-center gap-2 p-3 text-center text-xs">
    <span className="break-all text-muted-foreground">{translateKnownError(error)}</span>
    <Button size="sm" variant="outline" onClick={retry}>{t("common.retry")}</Button>
  </div>;
}

export function GitBlamePage(props: GitBlamePageProps) {
  return <BlameContext key={JSON.stringify([props.path, props.initialFile, props.initialSearch])} {...props} />;
}

function BlameContext({ path, initialFile, initialSearch = "", onClose }: GitBlamePageProps) {
  const { t } = useTranslation();
  const theme = useMonacoTheme();

  const [selectedFile, setSelectedFile] = useState<string | null>(initialFile);
  const readFiles = useCallback(() => invoke<string[]>("repo_list_files", { path }), [path]);
  const readBlame = useCallback(() => selectedFile
    ? invoke<BlameEntry[]>("repo_blame", { path, file: selectedFile, commit: null })
    : Promise.resolve([]), [path, selectedFile]);
  const files = useBlameRead(readFiles);
  const live = useBlameRead(readBlame);
  const [fileSearch, setFileSearch] = useState(initialSearch);
  const filterRef = useRef<HTMLInputElement>(null);
  const [activeCard, setActiveCard] = useState<ActiveCard | null>(null);
  const [previous, setPrevious] = useState<{ file: string; commit: string; entries: BlameEntry[] } | null>(null);
  const [previousStatus, setPreviousStatus] = useState<"idle" | "loading" | "error">("idle");

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const pendingPrevious = useRef(0);
  const originView = useRef<Monaco.editor.ICodeEditorViewState | null>(null);
  const restoreView = useRef(false);
  const displayedFile = previous?.file ?? selectedFile;
  const blameEntries = previous?.entries ?? live.value ?? EMPTY_BLAME;
  const blameLoading = !!selectedFile && !previous && live.loading;
  const blameError = previous ? undefined : live.error;

  useEffect(() => () => { pendingPrevious.current++; }, []);

  const closeCard = useCallback(() => {
    pendingPrevious.current++;
    setActiveCard(null);
    setPreviousStatus("idle");
  }, []);

  const backToOrigin = useCallback(() => {
    closeCard();
    restoreView.current = true;
    setPrevious(null);
  }, [closeCard]);

  const selectFile = (file: string) => {
    if (file === selectedFile) {
      if (previous) backToOrigin();
      return;
    }
    closeCard();
    originView.current = null;
    restoreView.current = false;
    setPrevious(null);
    setSelectedFile(file);
  };

  const openPrevious = async () => {
    const target = activeCard?.entry.previous;
    if (!target || previousStatus === "loading") return;
    const request = ++pendingPrevious.current;
    setPreviousStatus("loading");
    try {
      const entries = await invoke<BlameEntry[]>("repo_blame", { path, ...target });
      if (request !== pendingPrevious.current) return;
      originView.current = editorRef.current?.saveViewState() ?? null;
      setPrevious({ ...target, entries });
      closeCard();
    } catch {
      if (request === pendingPrevious.current) setPreviousStatus("error");
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeCard) closeCard();
        else if (previous) backToOrigin();
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, activeCard, previous, closeCard, backToOrigin]);

  const handleEditorMount = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor) => {
      editorRef.current = editor;
      const syncGutter = (scrollTop: number) => {
        if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
      };
      editor.onDidScrollChange(e => syncGutter(e.scrollTop));
      if (restoreView.current && originView.current) editor.restoreViewState(originView.current);
      restoreView.current = false;
      syncGutter(editor.getScrollTop());
    },
    [],
  );

  const fileContent = useMemo(
    () => blameEntries.map((e) => e.content).join("\n"),
    [blameEntries],
  );

  const language = useMemo(
    () => detectLanguage(displayedFile ?? ""),
    [displayedFile],
  );

  const handleGroupClick = useCallback((entry: BlameEntry, rect: DOMRect) => {
    pendingPrevious.current++;
    setPreviousStatus("idle");
    setActiveCard((prev) =>
      prev?.entry.line_no === entry.line_no
        ? null
        : { entry, top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 220)), left: rect.left },
    );
  }, []);

  const fileName = displayedFile?.split("/").pop() ?? null;
  const fileDir = displayedFile ? displayedFile.split("/").slice(0, -1).join("/") : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <AppHeader />

      <div className="flex shrink-0 items-center gap-3 border-b border-border/60 bg-card/60 px-4 py-2.5">
        <FileClock className="h-4 w-4 shrink-0 text-primary/70" />
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="text-[0.8125rem] font-semibold text-foreground">
            {t("blamePage.title")}
          </span>
          {fileName && (
            <>
              <span className="text-muted-foreground/40">·</span>
              {fileDir && (
                <span className="truncate text-[0.6875rem] text-muted-foreground/50">{fileDir}/</span>
              )}
              <span className="text-[0.75rem] font-semibold text-foreground/80">{fileName}</span>
              {blameEntries.length > 0 && (
                <span className="text-[0.6875rem] text-muted-foreground/50">
                  ({t("blamePage.linesCount", { count: blameEntries.length })})
                </span>
              )}
            </>
          )}
        </div>
        {previous && <Button type="button" variant="outline" size="sm" onClick={backToOrigin}>
          {t("blamePage.backToOriginal")}
        </Button>}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label={t("blamePage.closeAria")}
          title={t("blamePage.closeAria")}
        >
          <X />
        </Button>
      </div>
      {previous && <div role="status" className="flex flex-wrap gap-x-3 border-b px-4 py-1.5 text-xs text-muted-foreground">
        <span>{t("blamePage.previousRevision", { commit: previous.commit.slice(0, 8) })}</span>
        <span>{t("blamePage.noLineMapping")}</span>
      </div>}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className="flex shrink-0 flex-col border-r border-border/40 bg-card/30"
          style={{ width: 284 }}
        >
          <div className="flex shrink-0 items-center gap-1.5 border-b border-border/40 px-3 py-1.5">
            <GitCommitHorizontal className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="text-[0.6875rem] font-medium text-muted-foreground/60 uppercase tracking-wide">
              {t("blamePage.gutterLabel")}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {blameLoading ? (
              <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                <SpinIcon icon={Loader2} className="h-4 w-4 text-primary/50" />
                <span className="text-[0.75rem]">{t("blamePage.loading")}</span>
              </div>
            ) : !selectedFile ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <FileClock className="h-7 w-7 opacity-30" />
                <span className="text-[0.75rem]">{t("blamePage.pickFile")}</span>
              </div>
            ) : blameError !== undefined ? null : blameEntries.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[0.75rem] text-muted-foreground">
                {t("blamePage.noData")}
              </div>
            ) : (
              <BlameGutter
                key={JSON.stringify([displayedFile, previous?.commit])}
                entries={blameEntries}
                gutterRef={gutterRef}
                onGroupClick={handleGroupClick}
                onRevealLine={line => editorRef.current?.revealLineInCenterIfOutsideViewport(line)}
              />
            )}
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1">
          {!selectedFile ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <FileClock className="h-10 w-10 opacity-20" />
              <span className="text-sm">{t("blamePage.pickFile")}</span>
            </div>
          ) : blameLoading ? (
            <div className="flex h-full items-center justify-center">
              <SpinIcon icon={Loader2} className="h-6 w-6 text-primary/40" />
            </div>
          ) : blameError !== undefined ? (
            <BlameReadError error={blameError} retry={live.retry} />
          ) : (
            <Editor
              key={previous ? JSON.stringify([previous.file, previous.commit]) : selectedFile}
              language={language}
              value={fileContent}
              theme={theme}
              options={EDITOR_OPTIONS}
              onMount={handleEditorMount}
            />
          )}
        </div>

        <div
          className="flex shrink-0 flex-col border-l border-border/40 bg-card/40"
          style={{ width: 224 }}
        >
          <div className="shrink-0 border-b border-border/40 px-3 py-1.5">
            <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground/60">
              {t("blamePage.explorerLabel")}
            </span>
          </div>

          <div className="shrink-0 border-b border-border/30 px-2 py-1.5">
            <div className="flex items-center gap-1.5 rounded-md border border-border/40 bg-muted/30 px-2 py-1">
              <Search className="h-3 w-3 shrink-0 text-muted-foreground/50" />
              <Input
                ref={filterRef}
                type="text"
                variant="bare"
                inputSize="xs"
                value={fileSearch}
                aria-label={t("blamePage.searchPlaceholder")}
                onChange={(e) => setFileSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Escape" && fileSearch) {
                    e.stopPropagation();
                    setFileSearch("");
                  }
                }}
                placeholder={t("blamePage.searchPlaceholder")}
                className="flex-1"
                spellCheck={false}
              />
              {fileSearch && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("common.clear")}
                  onClick={() => { setFileSearch(""); filterRef.current?.focus(); }}
                >
                  <X />
                </Button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {files.loading ? (
              <div className="flex items-center justify-center py-8">
                <SpinIcon icon={Loader2} className="h-4 w-4 text-primary/40" />
              </div>
            ) : files.error !== undefined ? (
              <BlameReadError error={files.error} retry={files.retry} />
            ) : (
              <BlameFileTree files={files.value ?? []} query={fileSearch.trim()} selectedFile={selectedFile} onSelect={selectFile} />
            )}
          </div>
        </div>
      </div>

      {activeCard && (
        <CommitCard card={activeCard} onClose={closeCard}
          onPrevious={previous ? undefined : () => void openPrevious()} previousStatus={previousStatus} />
      )}
    </div>
  );
}
