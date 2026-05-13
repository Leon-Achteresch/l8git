import { Editor } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useEffect, useState } from "react";

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
    verticalScrollbarSize: 3,
    horizontalScrollbarSize: 3,
  },
  wordWrap: "off",
  automaticLayout: true,
};

function useMonacoTheme() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains("dark")),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  return isDark ? "vs-dark" : "vs";
}

export function GitHookEditor({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange: (val: string) => void;
  readOnly?: boolean;
}) {
  const theme = useMonacoTheme();
  return (
    <Editor
      language="shell"
      value={value}
      theme={theme}
      options={{ ...EDITOR_OPTIONS, readOnly: readOnly ?? false }}
      onChange={(val) => onChange(val ?? "")}
    />
  );
}
