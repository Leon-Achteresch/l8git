import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app/app-header";
import { toastError } from "@/lib/error-toast";
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
import { buildTree, FileTreeNode } from "./file-tree-node";
import { detectLanguage, EDITOR_OPTIONS } from "./git-blame-utils";
import { useMonacoTheme } from "./use-monaco-theme";
import { SpinIcon } from "@/components/motion/kit";

export function GitBlamePage({
  path,
  initialFile,
  onClose,
}: {
  path: string;
  initialFile: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const theme = useMonacoTheme();

  const [selectedFile, setSelectedFile] = useState<string | null>(initialFile);
  const [allFiles, setAllFiles] = useState<string[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [blameEntries, setBlameEntries] = useState<BlameEntry[]>([]);
  const [blameLoading, setBlameLoading] = useState(false);
  const [fileSearch, setFileSearch] = useState("");
  const [activeCard, setActiveCard] = useState<ActiveCard | null>(null);

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFilesLoading(true);
    invoke<string[]>("repo_list_files", { path })
      .then(setAllFiles)
      .catch((e) => toastError(String(e)))
      .finally(() => setFilesLoading(false));
  }, [path]);

  useEffect(() => {
    if (!selectedFile) return;
    setBlameLoading(true);
    setBlameEntries([]);
    setActiveCard(null);
    invoke<BlameEntry[]>("repo_blame", { path, file: selectedFile, commit: null })
      .then(setBlameEntries)
      .catch((e) => toastError(String(e)))
      .finally(() => setBlameLoading(false));
  }, [path, selectedFile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeCard) setActiveCard(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, activeCard]);

  const handleEditorMount = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor) => {
      editorRef.current = editor;
      editor.onDidScrollChange((e) => {
        if (gutterRef.current) {
          gutterRef.current.scrollTop = e.scrollTop;
        }
      });
    },
    [],
  );

  const fileContent = useMemo(
    () => blameEntries.map((e) => e.content).join("\n"),
    [blameEntries],
  );

  const language = useMemo(
    () => detectLanguage(selectedFile ?? ""),
    [selectedFile],
  );

  const tree = useMemo(() => {
    const filtered = fileSearch
      ? allFiles.filter((f) => f.toLowerCase().includes(fileSearch.toLowerCase()))
      : allFiles;
    return buildTree(filtered);
  }, [allFiles, fileSearch]);

  const handleGroupClick = useCallback((entry: BlameEntry, rect: DOMRect) => {
    setActiveCard((prev) =>
      prev?.entry.commit_hash === entry.commit_hash
        ? null
        : { entry, top: rect.bottom + 6, left: rect.left },
    );
  }, []);

  const fileName = selectedFile?.split("/").pop() ?? null;
  const fileDir = selectedFile ? selectedFile.split("/").slice(0, -1).join("/") : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <AppHeader />

      <div className="flex shrink-0 items-center gap-3 border-b border-border/60 bg-card/60 px-4 py-2.5">
        <FileClock className="h-4 w-4 shrink-0 text-primary/70" />
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="text-[13px] font-semibold text-foreground">
            {t("blamePage.title")}
          </span>
          {fileName && (
            <>
              <span className="text-muted-foreground/40">·</span>
              {fileDir && (
                <span className="truncate text-[11px] text-muted-foreground/50">{fileDir}/</span>
              )}
              <span className="text-[12px] font-semibold text-foreground/80">{fileName}</span>
              {blameEntries.length > 0 && (
                <span className="text-[11px] text-muted-foreground/50">
                  ({t("blamePage.linesCount", { count: blameEntries.length })})
                </span>
              )}
            </>
          )}
        </div>
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

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className="flex shrink-0 flex-col border-r border-border/40 bg-card/30"
          style={{ width: 284 }}
        >
          <div className="flex shrink-0 items-center gap-1.5 border-b border-border/40 px-3 py-1.5">
            <GitCommitHorizontal className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wide">
              {t("blamePage.gutterLabel")}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {blameLoading ? (
              <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                <SpinIcon icon={Loader2} className="h-4 w-4 text-primary/50" />
                <span className="text-[12px]">{t("blamePage.loading")}</span>
              </div>
            ) : !selectedFile ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <FileClock className="h-7 w-7 opacity-30" />
                <span className="text-[12px]">{t("blamePage.pickFile")}</span>
              </div>
            ) : blameEntries.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
                {t("blamePage.noData")}
              </div>
            ) : (
              <BlameGutter
                entries={blameEntries}
                gutterRef={gutterRef}
                onGroupClick={handleGroupClick}
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
          ) : (
            <Editor
              key={selectedFile}
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
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
              {t("blamePage.explorerLabel")}
            </span>
          </div>

          <div className="shrink-0 border-b border-border/30 px-2 py-1.5">
            <div className="flex items-center gap-1.5 rounded-md border border-border/40 bg-muted/30 px-2 py-1">
              <Search className="h-3 w-3 shrink-0 text-muted-foreground/50" />
              <Input
                type="text"
                variant="bare"
                inputSize="xs"
                value={fileSearch}
                onChange={(e) => setFileSearch(e.target.value)}
                placeholder={t("blamePage.searchPlaceholder")}
                className="flex-1"
                spellCheck={false}
              />
              {fileSearch && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setFileSearch("")}
                >
                  <X />
                </Button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {filesLoading ? (
              <div className="flex items-center justify-center py-8">
                <SpinIcon icon={Loader2} className="h-4 w-4 text-primary/40" />
              </div>
            ) : tree.length === 0 ? (
              <div className="px-3 py-4 text-center text-[12px] text-muted-foreground/50">
                {t("blamePage.noFiles")}
              </div>
            ) : (
              tree.map((node) => (
                <FileTreeNode
                  key={node.fullPath}
                  node={node}
                  selectedFile={selectedFile}
                  onSelect={setSelectedFile}
                  depth={0}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {activeCard && (
        <CommitCard card={activeCard} onClose={() => setActiveCard(null)} />
      )}
    </div>
  );
}
