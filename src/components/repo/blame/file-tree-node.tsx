import { ListRow } from "@/components/ui/list-row";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { useState } from "react";

export type TreeNode = {
  name: string;
  fullPath: string;
  isDir: boolean;
  children: TreeNode[];
};

export function buildTree(files: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  function insert(parts: string[], level: TreeNode[], accumulated: string) {
    if (parts.length === 0) return;
    const [head, ...tail] = parts as [string, ...string[]];
    const fullPath = accumulated ? `${accumulated}/${head}` : head;
    let node = level.find((n) => n.name === head);
    if (!node) {
      node = { name: head, fullPath, isDir: tail.length > 0, children: [] };
      level.push(node);
    }
    insert(tail, node.children, fullPath);
  }

  for (const file of files) {
    insert(file.split("/"), root, "");
  }
  return root;
}

export function FileTreeNode({
  node,
  selectedFile,
  onSelect,
  depth,
}: {
  node: TreeNode;
  selectedFile: string | null;
  onSelect: (path: string) => void;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 2);
  const isSelected = !node.isDir && node.fullPath === selectedFile;

  if (node.isDir) {
    return (
      <div>
        <ListRow
          variant="ghost"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          className="gap-1 pr-2"
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
        >
          <ChevronRight
            className={`size-3 transition-transform ${open ? "rotate-90" : ""}`}
          />
          {open ? (
            <FolderOpen className="text-git-tag" />
          ) : (
            <Folder className="text-git-tag" />
          )}
          <span className="truncate font-medium">{node.name}</span>
        </ListRow>
        {open && (
          <div>
            {node.children.map((child) => (
              <FileTreeNode
                key={child.fullPath}
                node={child}
                selectedFile={selectedFile}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <ListRow
      variant="accent"
      size="sm"
      active={isSelected}
      onClick={() => onSelect(node.fullPath)}
      className="gap-1.5 pr-2"
      style={{ paddingLeft: `${depth * 12 + 6 + 12}px` }}
      title={node.fullPath}
    >
      <File className={isSelected ? "text-primary" : "text-muted-foreground/50"} />
      <span className="truncate">{node.name}</span>
    </ListRow>
  );
}
