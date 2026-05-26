import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type RepoGroupDialogProps = {
  open: boolean;
  mode: "create" | "rename" | "subgroup";
  initialName?: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
};

export function RepoGroupDialog({
  open,
  mode,
  initialName = "",
  onSubmit,
  onClose,
}: RepoGroupDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  if (!open) return null;

  const title =
    mode === "rename"
      ? t("repoGroup.renameTitle")
      : mode === "subgroup"
        ? t("repoGroup.subgroupTitle")
        : t("repoGroup.createTitle");
  const submitLabel =
    mode === "rename" ? t("common.save") : t("repoGroup.create");

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label={t("dialogs.closeAria")}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="grid gap-4 p-4">
          <div className="grid gap-1.5">
            <Label htmlFor="repo-group-name">{t("repoGroup.nameLabel")}</Label>
            <Input
              id="repo-group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("repoGroup.namePlaceholder")}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={submit} disabled={!name.trim()}>
              {submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
