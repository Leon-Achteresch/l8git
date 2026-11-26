import type { ChangeRow } from "@/components/repo/commit/commit-panel-types";

export type ChangeTreeNode = {
  name: string;
  path: string;
  dirs: Map<string, ChangeTreeNode>;
  files: ChangeRow[];
  fileCount: number;
};

export type ChangeTreeItem =
  | {
      type: "folder";
      id: string;
      node: ChangeTreeNode;
      depth: number;
    }
  | { type: "file"; row: ChangeRow; depth: number };

function emptyNode(name: string, path: string): ChangeTreeNode {
  return { name, path, dirs: new Map(), files: [], fileCount: 0 };
}

export function buildChangeTree(rows: readonly ChangeRow[]): ChangeTreeNode {
  const root = emptyNode("", "");
  for (const row of rows) {
    const parts = row.path.split("/").filter(Boolean);
    let node = root;
    node.fileCount++;
    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i] as string;
      let next = node.dirs.get(segment);
      if (!next) {
        next = emptyNode(segment, node.path ? `${node.path}/${segment}` : segment);
        node.dirs.set(segment, next);
      }
      node = next;
      node.fileCount++;
    }
    node.files.push(row);
  }
  return root;
}

export function collectFolderPaths(node: ChangeTreeNode, out: string[] = []): string[] {
  for (const file of node.files) out.push(file.path);
  for (const dir of node.dirs.values()) collectFolderPaths(dir, out);
  return out;
}

export function flattenChangeTree(
  node: ChangeTreeNode,
  collapsed: ReadonlySet<string>,
  idPrefix: string,
  depth = 0,
): ChangeTreeItem[] {
  const out: ChangeTreeItem[] = [];

  function visit(node: ChangeTreeNode, depth: number) {
    const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const dir of dirs) {
      const id = `${idPrefix}${dir.path}`;
      out.push({
        type: "folder",
        id,
        node: dir,
        depth,
      });
      if (!collapsed.has(id)) {
        visit(dir, depth + 1);
      }
    }

    const files = [...node.files].sort((a, b) => a.path.localeCompare(b.path));
    for (const row of files) out.push({ type: "file", row, depth });
  }

  visit(node, depth);
  return out;
}

export function changeTreeItems(
  rows: readonly ChangeRow[],
  collapsed: ReadonlySet<string>,
  idPrefix: string,
): ChangeTreeItem[] {
  return flattenChangeTree(buildChangeTree(rows), collapsed, idPrefix);
}
