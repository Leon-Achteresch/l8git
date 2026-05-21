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
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-1 rounded py-[3px] pr-2 text-left text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
        >
          <ChevronRight
            className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          />
          {open ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
          )}
          <span className="truncate font-medium">{node.name}</span>
        </button>
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
    <button
      type="button"
      onClick={() => onSelect(node.fullPath)}
      className={`flex w-full items-center gap-1.5 rounded py-[3px] pr-2 text-left text-[12px] transition-colors ${
        isSelected
          ? "bg-primary/12 text-primary font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
      }`}
      style={{ paddingLeft: `${depth * 12 + 6 + 12}px` }}
      title={node.fullPath}
    >
      <File
        className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground/50"}`}
      />
      <span className="truncate">{node.name}</span>
    </button>
  );
}
