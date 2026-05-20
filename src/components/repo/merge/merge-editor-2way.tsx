import { DiffEditor, Editor } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { ChevronLeft, ChevronRight, Save } from "lucide-react";
import { useMergeDecorations } from "./use-merge-decorations";

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
  onSave: (content: string) => void;
  saving: boolean;
}

export function MergeEditor2Way({ versions, language, onSave, saving }: MergeEditor2WayProps) {
  const { t } = useTranslation();
  const theme = useMonacoTheme();
  const [resultText, setResultText] = useState(versions.current);
  const [activeBlockIdx, setActiveBlockIdx] = useState(0);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [editorInstance, setEditorInstance] = useState<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [monacoApi, setMonacoApi] = useState<typeof Monaco | null>(null);

  useMergeDecorations(editorInstance, monacoApi, resultText, activeBlockIdx);

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

  const scrollToBlock = useCallback((block: ConflictBlock | undefined) => {
    if (!block) return;
    editorRef.current?.revealLineInCenter(block.startLine + 1);
    editorRef.current?.setPosition({ lineNumber: block.startLine + 1, column: 1 });
  }, []);

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

  const conflictBadge = t("mergeEditor.conflictsBadge", { count: blocks.length });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 border-b border-border">
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              {t("mergeEditor.oursHead")}
            </span>
            <span className="mx-auto opacity-40">{t("mergeEditor.vs")}</span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
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
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-xs">
          <span className="font-medium text-muted-foreground">{t("mergeEditor.result")}</span>
          {hasConflicts ? (
            <>
              <span className="ml-1 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-amber-600 dark:text-amber-400">
                {conflictBadge}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={prevBlock}
                  disabled={activeBlockIdx === 0}
                  title={t("mergeEditor.prevConflict")}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-muted-foreground">
                  {activeBlockIdx + 1}/{blocks.length}
                </span>
                {activeBlock ? (
                  <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-600 dark:text-amber-400">
                    {t("mergeEditor.lineLabel", { line: activeBlock.startLine + 1 })}
                  </span>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={nextBlock}
                  disabled={activeBlockIdx >= blocks.length - 1}
                  title={t("mergeEditor.nextConflict")}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" size="sm" variant="outline" onClick={() => accept("ours")}>
                  {t("mergeEditor.ours")}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => accept("theirs")}>
                  {t("mergeEditor.theirs")}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => accept("both")}>
                  {t("mergeEditor.both")}
                </Button>
              </div>
            </>
          ) : (
            <span className="ml-1 rounded bg-green-500/20 px-1.5 py-0.5 text-green-600 dark:text-green-400">
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
