import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import { cn } from "@/lib/utils";

export function AgentInlineTitle({
  path,
  threadId,
  title,
  editing,
  onEditingChange,
  className,
  inputClassName,
}: {
  path: string;
  threadId: string;
  title: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  className?: string;
  inputClassName?: string;
}) {
  const renameThread = useAgentChatStore((state) => state.renameThread);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!editing) return;
    cancelledRef.current = false;
    setDraft(title);
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [editing, title]);

  const commit = () => {
    if (cancelledRef.current) return;
    onEditingChange(false);
    const next = draft.trim();
    if (!next || next === title) return;
    void renameThread(path, threadId, next).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : String(error));
    });
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        maxLength={256}
        aria-label="Rename chat"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancelledRef.current = true;
            setDraft(title);
            onEditingChange(false);
          }
        }}
        className={cn(
          "h-6 min-w-0 w-full rounded-md border border-border bg-background px-1.5 text-inherit font-inherit outline-none ring-2 ring-ring/25",
          inputClassName,
        )}
      />
    );
  }

  return (
    <span
      className={cn("truncate", className)}
      title={`${title} · Double-click to rename`}
      onDoubleClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        event.preventDefault();
        event.stopPropagation();
        onEditingChange(true);
      }}
    >
      {title}
    </span>
  );
}
