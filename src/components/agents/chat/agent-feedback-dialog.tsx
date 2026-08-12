import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import { agentProviderMeta } from "@/lib/agents/provider-meta";
import { useAgentProviderStore } from "@/lib/agents/provider-store";

export function AgentFeedbackDialog({
  open,
  onOpenChange,
  threadId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: string | null;
}) {
  const sendFeedback = useAgentChatStore((state) => state.sendFeedback);
  const provider = useAgentProviderStore((state) => state.provider);
  const providerLabel = agentProviderMeta(provider).label;
  const [reason, setReason] = useState("");
  const [includeLogs, setIncludeLogs] = useState(true);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!reason.trim()) return;
    setSending(true);
    try {
      const reference = await sendFeedback(reason, threadId ?? undefined, includeLogs);
      toast.success(`Feedback sent · ${reference}`);
      setReason("");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send {providerLabel} feedback</DialogTitle>
          <DialogDescription>Report a problem directly to the {providerLabel} team.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="What happened?"
          rows={5}
        />
        {provider === "codex" ? <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={includeLogs}
            onChange={(event) => setIncludeLogs(event.target.checked)}
            className="size-3.5 accent-foreground"
          />
          Include Codex logs
        </label> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={() => void submit()} disabled={!reason.trim() || sending}>
            {sending ? "Sending…" : "Send feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
