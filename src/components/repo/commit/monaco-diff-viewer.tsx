import { DiffEditor } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useEffect, useMemo, useState } from "react";
import { parseUnifiedDiff, type DiffLine } from "@/lib/unified-diff";
import { resolveTheme, getStoredTheme } from "@/lib/theme";

// ─── Language detection ────────────────────────────────────────────────────────

const EXT_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  rs: "rust",
  py: "python",
  rb: "ruby",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  cpp: "cpp",
  cc: "cpp",
  h: "cpp",
  cs: "csharp",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  htm: "html",
  xml: "xml",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  md: "markdown",
  mdx: "markdown",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  proto: "protobuf",
  dart: "dart",
  lua: "lua",
  r: "r",
  vue: "html",
  svelte: "html",
  php: "php",
  tf: "hcl",
};

function detectLanguage(filename: string | null): string {
  if (!filename) return "plaintext";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? "plaintext";
}

// ─── Parse unified diff into original / modified strings ─────────────────────
//
// The Monaco DiffEditor computes its own diff between `original` and `modified`.
// We reconstruct both sides from the unified diff:
//   - original = context lines + deleted lines (in order)
//   - modified  = context lines + added lines (in order)
//
// Hunk separators (@@) introduce "gaps" – lines that are not adjacent in the
// real file.  We insert a visible separator comment so Monaco doesn't merge
// unrelated hunks into a single diff block.

interface DiffContent {
  original: string;
  modified: string;
}

function buildDiffContent(lines: DiffLine[]): DiffContent {
  const originalLines: string[] = [];
  const modifiedLines: string[] = [];

  for (const line of lines) {
    switch (line.kind) {
      case "meta":
        // skip diff --git / index / --- / +++ header lines
        break;
      case "hunk":
        // Insert a blank separator line on both sides so the hunk boundary
        // is preserved and Monaco won't connect unrelated blocks.
        originalLines.push("");
        modifiedLines.push("");
        break;
      case "ctx":
        originalLines.push(line.text);
        modifiedLines.push(line.text);
        break;
      case "del":
        originalLines.push(line.text);
        break;
      case "add":
        modifiedLines.push(line.text);
        break;
    }
  }

  return {
    original: originalLines.join("\n"),
    modified: modifiedLines.join("\n"),
  };
}

// ─── Main component ────────────────────────────────────────────────────────────

interface MonacoDiffViewerProps {
  unifiedText: string;
  filename?: string | null;
}

export function MonacoDiffViewer({ unifiedText, filename }: MonacoDiffViewerProps) {
  const language = detectLanguage(filename ?? null);

  const [isDark, setIsDark] = useState<boolean>(
    () => resolveTheme(getStoredTheme()) === "dark",
  );

  // Sync with dark/light mode toggling (class on <html>)
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

  const monacoTheme = isDark ? "vs-dark" : "vs";

  const lines = useMemo(() => parseUnifiedDiff(unifiedText), [unifiedText]);
  const { original, modified } = useMemo(() => buildDiffContent(lines), [lines]);

  const options: Monaco.editor.IDiffEditorConstructionOptions = {
    readOnly: true,
    // ── Inline mode: single column, del/add lines one below the other ──
    renderSideBySide: false,
    // ── Visual tweaks ──────────────────────────────────────────────────
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontFamily: "\"Geist Mono\", ui-monospace, monospace",
    fontSize: 12,
    lineHeight: 18,
    renderLineHighlight: "none",
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
      verticalSliderSize: 3,
      horizontalSliderSize: 3,
    },
    wordWrap: "off",
    contextmenu: false,
    automaticLayout: true,
    renderOverviewRuler: false,
    ignoreTrimWhitespace: false,
    diffAlgorithm: "advanced",
    // Collapse identical regions so only changed hunks are visible
    hideUnchangedRegions: {
      enabled: true,
      minimumLineCount: 3,
      contextLineCount: 3,
    },
  };

  return (
    <div className="monaco-diff-viewer-root h-full min-h-0 w-full overflow-hidden">
      <DiffEditor
        language={language}
        original={original}
        modified={modified}
        theme={monacoTheme}
        options={options}
      />
    </div>
  );
}
