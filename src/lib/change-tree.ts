import type { ChangeRow } from "@/components/repo/commit/commit-panel-types";

export type ChangeTreeNode = {
  name: string;
  path: string;
  dirs: Map<string, ChangeTreeNode>;
  files: ChangeRow[];
};

export type ChangeTreeItem =
  | {
      type: "folder";
      id: string;
      path: string;
      name: string;
      depth: number;
      paths: string[];
    }
  | { type: "file"; row: ChangeRow; depth: number };

function emptyNode(name: string, path: string): ChangeTreeNode {
  return { name, path, dirs: new Map(), files: [] };
}

export function buildChangeTree(rows: readonly ChangeRow[]): ChangeTreeNode {
  const root = emptyNode("", "");
  for (const row of rows) {
    const parts = row.path.split("/").filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i] as string;
      let next = node.dirs.get(segment);
      if (!next) {
        next = emptyNode(segment, parts.slice(0, i + 1).join("/"));
        node.dirs.set(segment, next);
      }
      node = next;
    }
    node.files.push(row);
  }
  return root;
}

function collectPaths(node: ChangeTreeNode, out: string[]): string[] {
  for (const file of node.files) out.push(file.path);
  for (const dir of node.dirs.values()) collectPaths(dir, out);
  return out;
}

export function flattenChangeTree(
  node: ChangeTreeNode,
  collapsed: ReadonlySet<string>,
  idPrefix: string,
  depth = 0,
): ChangeTreeItem[] {
  const out: ChangeTreeItem[] = [];

  const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const dir of dirs) {
    const id = `${idPrefix}${dir.path}`;
    out.push({
      type: "folder",
      id,
      path: dir.path,
      name: dir.name,
      depth,
      paths: collectPaths(dir, []),
    });
    if (!collapsed.has(id)) {
      out.push(...flattenChangeTree(dir, collapsed, idPrefix, depth + 1));
    }
  }

  const files = [...node.files].sort((a, b) => a.path.localeCompare(b.path));
  for (const row of files) out.push({ type: "file", row, depth });

  return out;
}

export function changeTreeItems(
  rows: readonly ChangeRow[],
  collapsed: ReadonlySet<string>,
  idPrefix: string,
): ChangeTreeItem[] {
  return flattenChangeTree(buildChangeTree(rows), collapsed, idPrefix);
}
