import "@/lib/monaco-setup";
import { DiffEditor, Editor } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  type ConflictBlock,
  hasUnresolvedConflicts,
  parseConflictBlocks,
  resolveConflict,
} from "@/lib/conflict-parser";
import type { ConflictVersions } from "@/lib/repo-store";
import { resolveTheme, getStoredTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Save } from "lucide-react";
import { applyConflictSuggestion } from "@/lib/ai/conflict-suggest";
import { useMergeDecorations } from "./use-merge-decorations";
import { useConflictAi } from "./use-conflict-ai";
import { ConflictAiPreview, ConflictAiToolbar } from "./conflict-ai-panel";

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="ml-1 rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground opacity-70">
      {children}
    </kbd>
  );
}

function useMonacoTheme() {
  const [isDark, setIsDark] = useState(
    () => resolveTheme(getStoredTheme()) === "dark",
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  return isDark ? "vs-dark" : "vs";
}

const DIFF_OPTIONS: Monaco.editor.IDiffEditorConstructionOptions = {
  readOnly: true,
  renderSideBySide: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  fontSize: 12,
  lineHeight: 18,
  renderLineHighlight: "none",
  overviewRulerBorder: false,
  overviewRulerLanes: 0,
  folding: false,
  glyphMargin: false,
  lineNumbers: "on",
  lineDecorationsWidth: 4,
  scrollbar: { vertical: "auto", horizontal: "auto", useShadows: false, verticalScrollbarSize: 3, horizontalScrollbarSize: 3 },
  wordWrap: "off",
  contextmenu: false,
  automaticLayout: true,
  renderOverviewRuler: false,
  ignoreTrimWhitespace: false,
  diffAlgorithm: "advanced",
};

const RESULT_OPTIONS: Monaco.editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  fontSize: 12,
  lineHeight: 18,
  renderLineHighlight: "line",
  overviewRulerBorder: false,
  folding: false,
  glyphMargin: true,
  lineNumbers: "on",
  lineDecorationsWidth: 10,
  scrollbar: { vertical: "auto", horizontal: "auto", useShadows: false, verticalScrollbarSize: 6, horizontalScrollbarSize: 3 },
  wordWrap: "off",
  contextmenu: true,
  automaticLayout: true,
};

interface MergeEditor2WayProps {
  versions: ConflictVersions;
  language: string;
  filePath: string;
  repoPath?: string;
  onSave: (content: string) => void;
  saving: boolean;
}

export function MergeEditor2Way({
  versions,
  language,
  filePath,
  repoPath,
  onSave,
  saving,
}: MergeEditor2WayProps) {
  const { t } = useTranslation();
  const theme = useMonacoTheme();
  const [resultText, setResultText] = useState(versions.current);
  const [activeBlockIdx, setActiveBlockIdx] = useState(0);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [editorInstance, setEditorInstance] = useState<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [monacoApi, setMonacoApi] = useState<typeof Monaco | null>(null);
  const initialScrollDone = useRef(false);

  useMergeDecorations(editorInstance, monacoApi, resultText, activeBlockIdx);

  const ai = useConflictAi({
    filePath,
    repoPath,
    text: resultText,
    baseFile: versions.base,
  });

  useEffect(() => {
    setResultText(versions.current);
    setActiveBlockIdx(0);
  }, [versions.current]);

  const blocks = parseConflictBlocks(resultText);
  const hasConflicts = hasUnresolvedConflicts(resultText);
  const activeBlock: ConflictBlock | undefined = blocks[activeBlockIdx];

  function accept(choice: "ours" | "theirs" | "both") {
    if (!activeBlock) return;
    const resolved = resolveConflict(resultText, activeBlock, choice);
    setResultText(resolved);
    const newBlocks = parseConflictBlocks(resolved);
    setActiveBlockIdx((i) => Math.min(i, Math.max(0, newBlocks.length - 1)));
    editorRef.current?.revealLineInCenter(activeBlock.startLine + 1);
  }

  function acceptAll(choice: "ours" | "theirs") {
    let text = resultText;
    const allBlocks = parseConflictBlocks(text);
    for (let i = allBlocks.length - 1; i >= 0; i--) {
      text = resolveConflict(text, allBlocks[i], choice);
    }
    setResultText(text);
    setActiveBlockIdx(0);
  }

  function applyAiSuggestion(block: ConflictBlock, content: string) {
    const next = applyConflictSuggestion(resultText, block, content);
    setResultText(next);
    ai.dismiss(block);
    const newBlocks = parseConflictBlocks(next);
    setActiveBlockIdx((i) => Math.min(i, Math.max(0, newBlocks.length - 1)));
    editorRef.current?.revealLineInCenter(block.startLine + 1);
  }

  const scrollToBlock = useCallback((block: ConflictBlock | undefined) => {
    if (!block) return;
    editorRef.current?.revealLineInCenter(block.startLine + 1);
    editorRef.current?.setPosition({ lineNumber: block.startLine + 1, column: 1 });
  }, []);

  useEffect(() => {
    if (!editorInstance || initialScrollDone.current || blocks.length === 0) return;
    initialScrollDone.current = true;
    scrollToBlock(blocks[0]);
  }, [editorInstance, blocks, scrollToBlock]);

  function prevBlock() {
    const idx = Math.max(0, activeBlockIdx - 1);
    setActiveBlockIdx(idx);
    scrollToBlock(blocks[idx]);
  }

  function nextBlock() {
    const idx = Math.min(blocks.length - 1, activeBlockIdx + 1);
    setActiveBlockIdx(idx);
    scrollToBlock(blocks[idx]);
  }

  useEffect(() => {
    if (!hasConflicts) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") { e.preventDefault(); prevBlock(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); nextBlock(); }
      else if (e.key === "1") accept("ours");
      else if (e.key === "2") accept("theirs");
      else if (e.key === "3") accept("both");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasConflicts, activeBlockIdx, resultText]);

  const conflictBadge = t("mergeEditor.conflictsBadge", { count: blocks.length });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 border-b border-border">
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-git-added" />
              {t("mergeEditor.oursHead")}
            </span>
            <span className="mx-auto opacity-40">{t("mergeEditor.vs")}</span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-git-branch" />
              {t("mergeEditor.theirsIncoming")}
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <DiffEditor
              language={language}
              original={versions.ours}
              modified={versions.theirs}
              theme={theme}
              options={DIFF_OPTIONS}
            />
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-xs">
          <span className="font-medium text-muted-foreground">{t("mergeEditor.result")}</span>
          {hasConflicts ? (
            <>
              <span className="ml-1 rounded bg-git-modified/20 px-1.5 py-0.5 font-mono text-git-modified">
                {conflictBadge}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={prevBlock}
                  disabled={activeBlockIdx === 0}
                  title={t("mergeEditor.prevConflictKeys")}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-muted-foreground">
                  {activeBlockIdx + 1}/{blocks.length}
                </span>
                {activeBlock ? (
                  <span className="rounded border border-git-modified/40 bg-git-modified/10 px-1.5 py-0.5 font-mono text-[10px] text-git-modified">
                    {t("mergeEditor.lineLabel", { line: activeBlock.startLine + 1 })}
                  </span>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={nextBlock}
                  disabled={activeBlockIdx >= blocks.length - 1}
                  title={t("mergeEditor.nextConflictKeys")}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" size="sm" variant="outline" onClick={() => accept("ours")} title={t("mergeEditor.takeOursHint")}>
                  {t("mergeEditor.ours")}
                  <Kbd>1</Kbd>
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => accept("theirs")} title={t("mergeEditor.takeTheirsHint")}>
                  {t("mergeEditor.theirs")}
                  <Kbd>2</Kbd>
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => accept("both")} title={t("mergeEditor.keepBothHint")}>
                  {t("mergeEditor.both")}
                  <Kbd>3</Kbd>
                </Button>
              </div>
              <div className="flex items-center gap-1 border-l border-border pl-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="gap-1 text-git-added hover:bg-git-added/10 hover:text-git-added"
                  onClick={() => acceptAll("ours")}
                  title={t("mergeEditor.acceptAllOursHint")}
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                  {t("mergeEditor.allOurs")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="gap-1 text-git-branch hover:bg-git-branch/10 hover:text-git-branch"
                  onClick={() => acceptAll("theirs")}
                  title={t("mergeEditor.acceptAllTheirsHint")}
                >
                  {t("mergeEditor.allTheirs")}
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
              <ConflictAiToolbar ai={ai} block={activeBlock} blocks={blocks} />
            </>
          ) : (
            <span className="ml-1 rounded bg-git-added/20 px-1.5 py-0.5 text-git-added">
              {t("mergeEditor.allResolved")}
            </span>
          )}
          <Button
            type="button"
            size="sm"
            className="ml-auto"
            disabled={saving || hasConflicts}
            onClick={() => onSave(resultText)}
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            {saving ? "…" : t("mergeEditor.saveStage")}
          </Button>
        </div>
        <ConflictAiPreview ai={ai} block={activeBlock} onApply={applyAiSuggestion} />
        <div className="min-h-0 flex-1">
          <Editor
            language={language}
            value={resultText}
            theme={theme}
            options={RESULT_OPTIONS}
            onChange={(val) => setResultText(val ?? "")}
            onMount={(editor, monaco) => {
              editorRef.current = editor;
              setEditorInstance(editor);
              setMonacoApi(monaco);
            }}
          />
        </div>
      </div>
    </div>
  );
}
