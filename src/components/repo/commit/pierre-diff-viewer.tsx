import { MultiFileDiff, Virtualizer } from "@pierre/diffs/react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getStoredTheme, resolveTheme } from "@/lib/theme";
import { toastError } from "@/lib/error-toast";

export const PIERRE_DIFF_LANGS = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "rust",
  "python",
  "ruby",
  "go",
  "java",
  "kotlin",
  "swift",
  "c",
  "cpp",
  "csharp",
  "css",
  "scss",
  "less",
  "html",
  "xml",
  "json",
  "yaml",
  "toml",
  "markdown",
  "shellscript",
  "bash",
  "sql",
  "graphql",
  "dart",
  "lua",
  "php",
  "hcl",
  "vue",
  "svelte",
];

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState<boolean>(
    () => resolveTheme(getStoredTheme()) === "dark",
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains("dark")),
    );
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

const UNSAFE_CSS = `
[data-background] {
  --diffs-light-bg: var(--card) !important;
  --diffs-dark-bg: var(--card) !important;
}
`;

export function PierreFileDiff({
  repoPath,
  filePath,
  treeish = "HEAD",
}: {
  repoPath: string;
  filePath: string;
  treeish?: string;
}) {
  const isDark = useIsDark();
  const [oldContents, setOldContents] = useState<string | null>(null);
  const [newContents, setNewContents] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      invoke<string>("repo_file_content_at", {
        path: repoPath,
        file: filePath,
        treeish,
      }).catch(() => ""),
      invoke<string>("repo_read_file", {
        path: repoPath,
        file: filePath,
      }).catch(() => ""),
    ])
      .then(([oldText, newText]) => {
        if (cancelled) return;
        setOldContents(oldText);
        setNewContents(newText);
      })
      .catch((e) => {
        if (!cancelled) toastError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath, filePath, treeish]);

  if (loading || oldContents === null || newContents === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary/40" />
      </div>
    );
  }

  return (
    <Virtualizer
      className="h-full w-full overflow-auto"
      contentClassName="w-full!"
    >
      <MultiFileDiff
        className="w-full"
        oldFile={{ contents: oldContents, name: filePath }}
        newFile={{ contents: newContents, name: filePath }}
        options={{
          themeType: isDark ? "dark" : "light",
          diffStyle: "split",
          overflow: "scroll",
          disableFileHeader: true,
          collapsedContextThreshold: 0,
          lineDiffType: "word",
          unsafeCSS: UNSAFE_CSS,
        }}
      />
    </Virtualizer>
  );
}
