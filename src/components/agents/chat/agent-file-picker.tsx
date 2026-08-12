import { File, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import { agentProviderMeta } from "@/lib/agents/provider-meta";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import type { AgentFileMatch } from "@/lib/agents/types";

function absolutePath(match: AgentFileMatch): string {
  if (match.path.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(match.path)) return match.path;
  return `${match.root.replace(/[\\/]+$/u, "")}/${match.path.replace(/^[\\/]+/u, "")}`;
}

export function AgentFilePicker({
  path,
  open,
  onOpenChange,
  onSelect,
}: {
  path: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (file: { path: string; name: string }) => void;
}) {
  const searchFiles = useAgentChatStore((state) => state.searchFiles);
  const provider = useAgentProviderStore((state) => state.provider);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AgentFileMatch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void searchFiles(path, query)
        .then((files) => {
          if (!cancelled) setResults(files.slice(0, 100));
        })
        .catch((error: unknown) => {
          if (!cancelled) toast.error(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, query ? 100 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, path, query, searchFiles]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
      title="Mention a file"
      description={`Search repository files for ${agentProviderMeta(provider).label}`}
      className="max-w-xl"
      showCloseButton
    >
      <Command shouldFilter={false}>
      <CommandInput value={query} onValueChange={setQuery} placeholder="Search files…" />
      <CommandList>
        {loading && results.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Searching…
          </div>
        ) : (
          <>
            <CommandEmpty>No matching files.</CommandEmpty>
            {results.map((match) => (
              <CommandItem
                key={`${match.root}:${match.path}`}
                value={match.path}
                onSelect={() => {
                  onSelect({ path: absolutePath(match), name: match.fileName });
                  onOpenChange(false);
                }}
                className="py-2"
              >
                <File className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{match.path}</span>
              </CommandItem>
            ))}
          </>
        )}
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
