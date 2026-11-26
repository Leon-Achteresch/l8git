import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { filePathFilter } from "@/lib/file-path-filter";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type TreeNode = {
  name: string;
  fullPath: string;
  children?: TreeNode[];
};

const PAGE_SIZE = 150;

export function buildTree(files: readonly string[]): TreeNode[] {
  const root: TreeNode[] = [];
  const directories = new Map<string, TreeNode[]>();
  const seen = new Set<string>();
  for (const file of files) {
    if (!file || seen.has(file)) continue;
    seen.add(file);
    const parts = file.split("/");
    let level = root;
    let path = "";
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      path = path ? `${path}/${part}` : part;
      let children = directories.get(path);
      if (!children) {
        children = [];
        directories.set(path, children);
        level.push({ name: part, fullPath: path, children });
      }
      level = children;
    }
    level.push({ name: parts[parts.length - 1], fullPath: file });
  }
  return root;
}

export function BlameFileTree({ files, query, selectedFile, onSelect }: {
  files: readonly string[];
  query: string;
  selectedFile: string | null;
  onSelect: (file: string) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [page, setPage] = useState({ query: "", count: PAGE_SIZE });
  const container = useRef<HTMLDivElement>(null);
  const nextFocus = useRef<number | null>(null);
  const limit = page.query === query ? page.count : PAGE_SIZE;
  const browsing = !query;
  const tree = useMemo(() => browsing ? buildTree(files) : [], [browsing, files]);
  const rows = useMemo(() => {
    const visible: { node: TreeNode; depth: number; open: boolean }[] = [];
    if (!browsing) {
      const matches = filePathFilter(query);
      const seen = new Set<string>();
      for (const fullPath of files) {
        if (!matches(fullPath) || seen.has(fullPath)) continue;
        seen.add(fullPath);
        const name = fullPath.slice(fullPath.lastIndexOf("/") + 1);
        visible.push({ node: { name, fullPath }, depth: 0, open: false });
        if (visible.length > limit) break;
      }
      return visible;
    }
    function visit(nodes: TreeNode[], depth: number) {
      for (const node of nodes) {
        if (visible.length > limit) return;
        const open = expanded.get(node.fullPath) ?? depth < 2;
        visible.push({ node, depth, open });
        if (node.children && open) visit(node.children, depth + 1);
      }
    }
    visit(tree, 0);
    return visible;
  }, [browsing, tree, expanded, query, files, limit]);

  useLayoutEffect(() => {
    const index = nextFocus.current;
    nextFocus.current = null;
    if (index !== null) container.current?.querySelector<HTMLButtonElement>(`[data-blame-index="${index}"]`)?.focus();
  }, [page]);

  if (!rows.length) return <div className="px-3 py-4 text-center text-xs text-muted-foreground">{t("blamePage.noFiles")}</div>;
  return <div ref={container}>
    {rows.slice(0, limit).map(({ node, depth, open }, index) => {
      const selected = !node.children && node.fullPath === selectedFile;
      if (node.children) return (
        <ListRow key={`dir:${node.fullPath}`} data-blame-index={index} variant="ghost" size="sm" aria-expanded={open}
          onClick={() => setExpanded(previous => new Map(previous).set(node.fullPath, !open))}
          className="gap-1 pr-2" style={{ paddingLeft: depth * 12 + 6 }}>
          <ChevronRight className={`size-3 transition-transform ${open ? "rotate-90" : ""}`} />
          {open ? <FolderOpen className="text-git-tag" /> : <Folder className="text-git-tag" />}
          <span className="truncate font-medium">{node.name}</span>
        </ListRow>
      );
      return (
        <ListRow key={`file:${node.fullPath}`} data-blame-index={index} variant="accent" size="sm" active={selected}
          aria-current={selected ? "true" : undefined} onClick={() => onSelect(node.fullPath)}
          className="gap-1.5 pr-2" style={{ paddingLeft: browsing ? depth * 12 + 18 : 8 }} title={node.fullPath}>
          <File className={selected ? "text-primary" : "text-muted-foreground/50"} />
          <span className="truncate">{browsing ? node.name : node.fullPath}</span>
        </ListRow>
      );
    })}
    {rows.length > limit && <Button type="button" size="sm" variant="ghost" className="w-full" onClick={() => {
      nextFocus.current = limit;
      setPage({ query, count: limit + PAGE_SIZE });
    }}>
      {t("blamePage.showMore")}
    </Button>}
  </div>;
}
