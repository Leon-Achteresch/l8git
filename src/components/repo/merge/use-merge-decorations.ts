import type * as Monaco from "monaco-editor";
import { useEffect, useRef } from "react";
import { parseConflictBlocks } from "@/lib/conflict-parser";

export function useMergeDecorations(
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  monaco: typeof Monaco | null,
  text: string,
  activeBlockIdx: number,
) {
  const collectionRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);

  useEffect(() => {
    if (!editor || !monaco) return;
    if (!collectionRef.current) {
      collectionRef.current = editor.createDecorationsCollection([]);
    }

    const blocks = parseConflictBlocks(text);
    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];

    const oursRulerColor = "rgba(34, 197, 94, 0.7)";
    const theirsRulerColor = "rgba(59, 130, 246, 0.7)";
    const markerRulerColor = "rgba(245, 158, 11, 0.9)";

    for (const block of blocks) {
      const isActive = block.index === activeBlockIdx;
      const startLine = block.startLine + 1;
      const endLine = block.endLine + 1;
      const separatorLine = block.separatorLine + 1;

      decorations.push({
        range: new monaco.Range(startLine, 1, startLine, 1),
        options: {
          isWholeLine: true,
          className: isActive ? "merge-marker-line merge-marker-line-active" : "merge-marker-line",
          glyphMarginClassName: "merge-glyph-warning",
          glyphMarginHoverMessage: { value: "**Conflict start** — `<<<<<<< HEAD`" },
          linesDecorationsClassName: isActive ? "merge-active-edge" : undefined,
          overviewRuler: {
            color: markerRulerColor,
            position: monaco.editor.OverviewRulerLane.Full,
          },
          minimap: {
            color: markerRulerColor,
            position: monaco.editor.MinimapPosition.Inline,
          },
        },
      });

      if (block.oursEndLine >= block.oursStartLine) {
        decorations.push({
          range: new monaco.Range(
            block.oursStartLine + 1,
            1,
            block.oursEndLine + 1,
            1,
          ),
          options: {
            isWholeLine: true,
            className: isActive ? "merge-ours-region merge-region-active" : "merge-ours-region",
            linesDecorationsClassName: isActive ? "merge-active-edge" : "merge-ours-edge",
            overviewRuler: {
              color: oursRulerColor,
              position: monaco.editor.OverviewRulerLane.Left,
            },
          },
        });
      }

      if (separatorLine > startLine && separatorLine < endLine) {
        decorations.push({
          range: new monaco.Range(separatorLine, 1, separatorLine, 1),
          options: {
            isWholeLine: true,
            className: "merge-separator-line",
            linesDecorationsClassName: isActive ? "merge-active-edge" : undefined,
          },
        });
      }

      if (block.theirsEndLine >= block.theirsStartLine) {
        decorations.push({
          range: new monaco.Range(
            block.theirsStartLine + 1,
            1,
            block.theirsEndLine + 1,
            1,
          ),
          options: {
            isWholeLine: true,
            className: isActive ? "merge-theirs-region merge-region-active" : "merge-theirs-region",
            linesDecorationsClassName: isActive ? "merge-active-edge" : "merge-theirs-edge",
            overviewRuler: {
              color: theirsRulerColor,
              position: monaco.editor.OverviewRulerLane.Right,
            },
          },
        });
      }

      decorations.push({
        range: new monaco.Range(endLine, 1, endLine, 1),
        options: {
          isWholeLine: true,
          className: isActive ? "merge-marker-line merge-marker-line-active" : "merge-marker-line",
          glyphMarginClassName: "merge-glyph-warning",
          glyphMarginHoverMessage: { value: "**Conflict end** — `>>>>>>>`" },
          linesDecorationsClassName: isActive ? "merge-active-edge" : undefined,
        },
      });
    }

    collectionRef.current.set(decorations);
  }, [editor, monaco, text, activeBlockIdx]);

  useEffect(() => {
    return () => {
      collectionRef.current?.clear();
      collectionRef.current = null;
    };
  }, []);
}
