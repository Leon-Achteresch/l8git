import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import { parseIssueRef } from "@/lib/jira/issue-key";
import { useJiraStore } from "@/lib/jira/jira-store";

/**
 * Links a Jira ticket to one conversation. Accepts a bare key or anything
 * pasted out of Jira, and resolves it once so the row can show a real title
 * and status instead of just the key.
 */
export function AgentJiraLinkDialog({
  threadKey,
  open,
  onOpenChange,
}: {
  threadKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const linkTicket = useJiraStore((state) => state.linkTicket);
  const configured = useJiraStore((state) => state.status.configured);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setDraft("");
  }, [open]);

  const submit = async () => {
    const key = parseIssueRef(draft);
    if (!key) {
      toast.error(t("jira.invalidKey"));
      return;
    }
    setBusy(true);
    try {
      const link = await linkTicket(threadKey, key);
      onOpenChange(false);
      toast.success(t("jira.linkedToast", { key: link.key }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("jira.linkTicket")}</DialogTitle>
          <DialogDescription>
            {configured ? t("jira.linkDialogDesc") : t("jira.notConfigured")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Label htmlFor="jira-link-key" className="text-sm font-medium">
            {t("jira.linkKeyLabel")}
          </Label>
          <Input
            id="jira-link-key"
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("jira.linkPlaceholder")}
            className="font-mono text-sm"
            spellCheck={false}
            autoCorrect="off"
            autoComplete="off"
            disabled={busy || !configured}
          />
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={busy || !configured || !draft.trim()}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("jira.linkTicket")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
