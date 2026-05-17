import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Workspace, useWorkspaceStore } from "@/lib/workspace-store";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

function DialogBackdrop({
  onDismiss,
  children,
}: {
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-[2px]"
      onClick={onDismiss}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-sm flex-col rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function WorkspaceCreateDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) setName("");
  }, [open]);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    addWorkspace(trimmed);
    onClose();
  }

  if (!open) return null;

  return (
    <DialogBackdrop onDismiss={onClose}>
      <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t("workspaceDialogs.addWorkspaceTitle")}</h2>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("dialogs.closeAria")}>
          <X className="h-4 w-4" />
        </Button>
      </header>
      <div className="grid gap-4 p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="workspace-name">{t("workspaceDialogs.nameLabel")}</Label>
          <Input
            id="workspace-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("workspaceDialogs.namePlaceholderExample")}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={submit} disabled={!name.trim()}>
            {t("workspaceDialogs.create")}
          </Button>
        </div>
      </div>
    </DialogBackdrop>
  );
}

export function WorkspaceEditDialog({
  open,
  onClose,
  workspace,
}: {
  open: boolean;
  onClose: () => void;
  workspace: Workspace;
}) {
  const { t } = useTranslation();
  const { renameWorkspace, removeWorkspace, workspaces } = useWorkspaceStore(
    useShallow((s) => ({
      renameWorkspace: s.renameWorkspace,
      removeWorkspace: s.removeWorkspace,
      workspaces: s.workspaces,
    })),
  );
  const [name, setName] = useState(workspace.name);
  const isLast = workspaces.length <= 1;

  useEffect(() => {
    if (open) setName(workspace.name);
  }, [open, workspace.name]);

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    renameWorkspace(workspace.id, trimmed);
    onClose();
  }

  function handleDelete() {
    if (isLast) return;
    removeWorkspace(workspace.id);
    onClose();
  }

  if (!open) return null;

  return (
    <DialogBackdrop onDismiss={onClose}>
      <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t("workspaceDialogs.editTitle")}</h2>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("dialogs.closeAria")}>
          <X className="h-4 w-4" />
        </Button>
      </header>
      <div className="grid gap-4 p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="workspace-edit-name">{t("workspaceDialogs.nameLabel")}</Label>
          <Input
            id="workspace-edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </div>
        <div className="flex items-center justify-between pt-1">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={isLast}
            title={isLast ? t("workspaceDialogs.lastWorkspaceDeleteTitle") : undefined}
          >
            {t("workspaceDialogs.delete")}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={save} disabled={!name.trim()}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      </div>
    </DialogBackdrop>
  );
}
