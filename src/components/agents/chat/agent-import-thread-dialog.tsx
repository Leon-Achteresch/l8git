import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function AgentImportThreadDialog({
  open,
  threadId,
  onOpenChange,
  onThreadIdChange,
  onImport,
}: {
  open: boolean;
  threadId: string;
  onOpenChange: (open: boolean) => void;
  onThreadIdChange: (threadId: string) => void;
  onImport: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>{t("agentChat.importConversation")}</DialogTitle>
          <DialogDescription>{t("agentChat.importPrompt")}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onImport();
          }}
          className="space-y-3"
        >
          <Input
            autoFocus
            value={threadId}
            onChange={(event) => onThreadIdChange(event.target.value)}
            placeholder="019…"
            className="font-mono text-xs"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!threadId.trim()}>Import</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
