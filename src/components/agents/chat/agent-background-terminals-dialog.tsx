import { LoaderCircle, SquareTerminal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import { agentProviderMeta } from "@/lib/agents/provider-meta";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import type { AgentBackgroundTerminal } from "@/lib/agents/types";
import { SpinIcon } from "@/components/motion/kit";

export function AgentBackgroundTerminalsDialog({
  threadId,
  open,
  onOpenChange,
}: {
  threadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const provider = useAgentProviderStore((state) => state.provider);
  const list = useAgentChatStore((state) => state.listBackgroundTerminals);
  const stopAll = useAgentChatStore((state) => state.stopBackgroundTerminals);
  const terminate = useAgentChatStore((state) => state.terminateBackgroundTerminal);
  const [terminals, setTerminals] = useState<AgentBackgroundTerminal[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setTerminals(await list(threadId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void refresh();
  }, [open, threadId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Background terminals</DialogTitle>
          <DialogDescription>Shell processes still running for this {agentProviderMeta(provider).label} chat.</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <SpinIcon icon={LoaderCircle} className="size-4" /> Loading…
            </div>
          ) : terminals.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No background terminals
            </div>
          ) : terminals.map((terminal) => (
            <div key={terminal.processId} className="flex items-start gap-2 rounded-xl border border-border/60 p-3">
              <SquareTerminal className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="break-all font-mono text-xs">{terminal.command}</p>
                <p className="mt-1 truncate text-[10px] text-muted-foreground">
                  PID {terminal.osPid ?? terminal.processId} · {terminal.cwd}
                  {terminal.cpuPercent !== null ? ` · ${terminal.cpuPercent.toFixed(1)}% CPU` : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-full text-muted-foreground"
                aria-label="Stop terminal"
                onClick={() => void terminate(threadId, terminal.processId)
                  .then(() => refresh())
                  .catch((error: unknown) => toast.error(error instanceof Error ? error.message : String(error)))}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
        {terminals.length > 0 ? (
          <div className="flex justify-end border-t border-border/50 pt-3">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => void stopAll(threadId)
                .then(() => refresh())
                .catch((error: unknown) => toast.error(error instanceof Error ? error.message : String(error)))}
            >
              Stop all
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
