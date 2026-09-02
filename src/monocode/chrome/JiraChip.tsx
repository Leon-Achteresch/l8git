import { useState } from "react";
import { useJiraLinks, useJiraStore } from "@/lib/jira/jira-store";
import { jiraThreadKeyFor } from "../lib/jiraMcp";
import { X } from "./icons";

export function JiraChip({ sessionId, enabled }: { sessionId?: string; enabled: boolean }) {
  const jiraOn = useJiraStore((s) => s.enabled && s.status.configured);
  const linkTicket = useJiraStore((s) => s.linkTicket);
  const unlinkTicket = useJiraStore((s) => s.unlinkTicket);
  const threadKey = sessionId ? jiraThreadKeyFor(sessionId) : "";
  const links = useJiraLinks(threadKey);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!jiraOn || !sessionId) return null;

  const submit = async () => {
    const ref = value.trim();
    if (!ref) return setEditing(false);
    try {
      await linkTicket(threadKey, ref);
      setValue("");
      setError(null);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      {links.map((link) => (
        <span
          key={link.key}
          title={`${link.summary} · ${link.status}`}
          className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] ${
            link.statusCategory === "done"
              ? "bg-emerald-500/15 text-emerald-300"
              : link.statusCategory === "indeterminate"
                ? "bg-mono-accent/15 text-mono-accent"
                : "bg-content/10 text-content/70"
          }`}
        >
          {link.key}
          <button
            type="button"
            aria-label={`Unlink ${link.key}`}
            onClick={() => unlinkTicket(threadKey, link.key)}
            className="text-content/40 hover:text-content"
          >
            <X className="size-3" strokeWidth={2} />
          </button>
        </span>
      ))}
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={() => void submit()}
          placeholder="ABC-123"
          title={error ?? undefined}
          className={`w-24 rounded-md border bg-transparent px-1.5 py-0.5 text-[11px] text-content outline-none ${
            error ? "border-red-400/60" : "border-content/15"
          }`}
        />
      ) : (
        <button
          type="button"
          disabled={!enabled}
          onClick={() => setEditing(true)}
          className="rounded-md px-1.5 py-0.5 text-[11px] text-content/45 hover:bg-content/10 hover:text-content"
        >
          + Jira
        </button>
      )}
    </div>
  );
}
