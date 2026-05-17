import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Undo2 } from "lucide-react";
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
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1.5 p-3">
          {files.map((file) => (
            <CommitInspectFileItem
              key={file.path}
              file={file}
              isSelected={selectedFile === file.path}
              isChecked={checkedFiles?.has(file.path)}
              onSelect={() =>
                onSelectFile(selectedFile === file.path ? null : file.path)
              }
              onBlame={onBlame ? () => onBlame(file.path) : undefined}
              onDiscard={onDiscardFile ? () => onDiscardFile(file.path) : undefined}
              onCheckedChange={
                onCheckedChange
                  ? (checked) => onCheckedChange(file.path, !!checked)
                  : undefined
              }
            />
          ))}
          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
              <span className="text-sm font-medium">
                {t("commitInspect.noFilesInCommit")}
              </span>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
