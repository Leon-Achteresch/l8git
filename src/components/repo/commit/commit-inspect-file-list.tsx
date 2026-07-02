import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Undo2 } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  CommitChangedFile,
  CommitInspectFileItem,
} from "./commit-inspect-file-item";

export function CommitInspectFileList({
  files,
  selectedFile,
  checkedFiles,
  onSelectFile,
  onBlame,
  onDiscardFile,
  onCheckedChange,
  onDiscardChecked,
}: {
  files: CommitChangedFile[];
  selectedFile: string | null;
  checkedFiles?: ReadonlySet<string>;
  onSelectFile: (path: string | null) => void;
  onBlame?: (path: string) => void;
  onDiscardFile?: (path: string) => void;
  onCheckedChange?: (path: string, checked: boolean) => void;
  onDiscardChecked?: () => void;
}) {
  const { t } = useTranslation();
  const checkedCount = checkedFiles?.size ?? 0;

  const allChecked = files.length > 0 && checkedCount === files.length;
  const someChecked = checkedCount > 0 && checkedCount < files.length;
  let checkboxState: boolean | "indeterminate" = false;
  if (allChecked) checkboxState = true;
  else if (someChecked) checkboxState = "indeterminate";

  const scrollerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 54,
    overscan: 8,
    getItemKey: (i) => files[i]?.path ?? i,
  });

  return (
    <div className="flex min-h-0 flex-col bg-muted/5">
      {onCheckedChange !== undefined && files.length > 0 && (
        <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-1.5">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={checkboxState}
              onCheckedChange={(checked) => {
                for (const f of files) {
                  onCheckedChange(f.path, !!checked);
                }
              }}
              className="h-4 w-4"
            />
            <span className="text-xs text-muted-foreground">
              {checkedCount > 0
                ? t("commitInspect.partialSelected", { count: checkedCount })
                : t("commitInspect.selectAll")}
            </span>
          </div>
          {checkedCount > 0 && onDiscardChecked && (
            <Button
              size="sm"
              variant="destructive"
              className="h-6 gap-1 px-2 text-xs"
              onClick={onDiscardChecked}
            >
              <Undo2 className="h-3 w-3" />
              {t("commitInspect.discardVerb")}
            </Button>
          )}
        </div>
      )}
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="p-3">
          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
              <span className="text-sm font-medium">
                {t("commitInspect.noFilesInCommit")}
              </span>
            </div>
          ) : (
            <div
              style={{
                height: virtualizer.getTotalSize(),
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((vi) => {
                const file = files[vi.index];
                if (!file) return null;
                return (
                  <div
                    key={vi.key}
                    data-index={vi.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      transform: `translateY(${vi.start}px)`,
                    }}
                  >
                    <div className="pb-1.5">
                      <CommitInspectFileItem
                        file={file}
                        isSelected={selectedFile === file.path}
                        isChecked={checkedFiles?.has(file.path)}
                        onSelect={onSelectFile}
                        onBlame={onBlame}
                        onDiscard={onDiscardFile}
                        onCheckedChange={onCheckedChange}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
