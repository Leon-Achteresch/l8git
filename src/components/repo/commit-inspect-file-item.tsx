import { FileCode2, Plus, Minus } from "lucide-react";

export type CommitChangedFile = {
  path: string;
  additions: number;
  deletions: number;
  binary: boolean;
};

export function CommitInspectFileItem({
  file,
  isSelected,
  onSelect,
}: {
  file: CommitChangedFile;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const baseName = file.path.split("/").pop() ?? file.path;
  const directory = file.path.split("/").slice(0, -1).join("/");

  return (
    <div
      onClick={onSelect}
      className={`group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-all duration-200 ease-in-out ${
        isSelected
          ? "bg-primary/15 text-primary shadow-sm ring-1 ring-primary/20"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      <FileCode2
        className={`h-4 w-4 shrink-0 transition-transform ${
          isSelected ? "scale-110 text-primary" : "opacity-60 group-hover:opacity-100"
        }`}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold tracking-tight">
          {baseName}
        </span>
        {directory ? (
          <span className="truncate text-[10px] font-medium opacity-60">
            {directory}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs font-medium">
        {file.binary ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Binär
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
            {file.additions > 0 ? (
              <span className="flex items-center gap-0.5 text-git-added">
                <Plus className="h-3 w-3" />
                {file.additions}
              </span>
            ) : null}
            {file.deletions > 0 ? (
              <span className="flex items-center gap-0.5 text-git-removed">
                <Minus className="h-3 w-3" />
                {file.deletions}
              </span>
            ) : null}
            {file.additions === 0 && file.deletions === 0 ? (
              <span className="text-muted-foreground opacity-50">0</span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
