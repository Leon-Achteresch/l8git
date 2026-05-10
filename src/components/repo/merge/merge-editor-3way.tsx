import { DiffEditor, Editor } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
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

const BASE_DIFF_OPTIONS: Monaco.editor.IDiffEditorConstructionOptions = {
  readOnly: true,
  renderSideBySide: false,
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
  glyphMargin: false,
  lineNumbers: "on",
  lineDecorationsWidth: 4,
  scrollbar: { vertical: "auto", horizontal: "auto", useShadows: false, verticalScrollbarSize: 3, horizontalScrollbarSize: 3 },
  wordWrap: "off",
  contextmenu: true,
  automaticLayout: true,
};

interface MergeEditor3WayProps {
  versions: ConflictVersions;
  language: string;
  onSave: (content: string) => void;
  saving: boolean;
}

export function MergeEditor3Way({ versions, language, onSave, saving }: MergeEditor3WayProps) {
  const theme = useMonacoTheme();
  const [resultText, setResultText] = useState(versions.current);
  const [activeBlockIdx, setActiveBlockIdx] = useState(0);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  // Reset when file changes
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
    // Move cursor in editor to the resolved position
    const lineNumber = activeBlock.startLine + 1;
    editorRef.current?.revealLineInCenter(lineNumber);
  }

  const scrollToBlock = useCallback(
    (block: ConflictBlock | undefined) => {
      if (!block) return;
      editorRef.current?.revealLineInCenter(block.startLine + 1);
      editorRef.current?.setPosition({ lineNumber: block.startLine + 1, column: 1 });
    },
    [],
  );

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top row: Ours (vs Base) | Theirs (vs Base) */}
      <div className="flex min-h-0 flex-1 border-b border-border">
        {/* Ours panel */}
        <div className="flex min-h-0 flex-1 flex-col border-r border-border">
          <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Ours (HEAD)
          </div>
          <div className="min-h-0 flex-1">
            <DiffEditor
              language={language}
              original={versions.base}
              modified={versions.ours}
              theme={theme}
              options={BASE_DIFF_OPTIONS}
            />
          </div>
        </div>
        {/* Theirs panel */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Theirs (Incoming)
          </div>
          <div className="min-h-0 flex-1">
            <DiffEditor
              language={language}
              original={versions.base}
              modified={versions.theirs}
              theme={theme}
              options={BASE_DIFF_OPTIONS}
            />
          </div>
        </div>
      </div>

      {/* Bottom: Result editor */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-xs">
          <span className="font-medium text-muted-foreground">Result</span>
          {hasConflicts ? (
            <>
              <span className="ml-1 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-amber-600 dark:text-amber-400">
                {blocks.length} Konflikt{blocks.length !== 1 ? "e" : ""}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={prevBlock}
                  disabled={activeBlockIdx === 0}
                  title="Vorheriger Konflikt"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-muted-foreground">
                  {activeBlockIdx + 1}/{blocks.length}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={nextBlock}
                  disabled={activeBlockIdx >= blocks.length - 1}
                  title="Nächster Konflikt"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" size="sm" variant="outline" onClick={() => accept("ours")}>
                  Ours
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => accept("theirs")}>
                  Theirs
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => accept("both")}>
                  Beide
                </Button>
              </div>
            </>
          ) : (
            <span className="ml-1 rounded bg-green-500/20 px-1.5 py-0.5 text-green-600 dark:text-green-400">
              Alle Konflikte aufgelöst
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
            {saving ? "…" : "Speichern & Stagen"}
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <Editor
            language={language}
            value={resultText}
            theme={theme}
            options={RESULT_OPTIONS}
            onChange={(val) => setResultText(val ?? "")}
            onMount={(editor) => {
              editorRef.current = editor;
            }}
          />
        </div>
      </div>
    </div>
  );
}
