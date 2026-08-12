import { AppWindow, LoaderCircle, Sparkles } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import { agentProviderMeta } from "@/lib/agents/provider-meta";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import type { AgentApp, AgentSkill } from "@/lib/agents/types";

export function AgentResourcePicker({
  kind,
  open,
  onOpenChange,
  path,
  threadId,
  onSelectSkill,
  onSelectApp,
}: {
  kind: "skill" | "app";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  path: string;
  threadId: string | null;
  onSelectSkill: (skill: AgentSkill) => void;
  onSelectApp: (app: AgentApp) => void;
}) {
  const listSkills = useAgentChatStore((state) => state.listSkills);
  const provider = useAgentProviderStore((state) => state.provider);
  const listApps = useAgentChatStore((state) => state.listApps);
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [apps, setApps] = useState<AgentApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const request = kind === "skill" ? listSkills(path) : listApps(threadId ?? undefined);
    void request
      .then((items) => {
        if (cancelled) return;
        if (kind === "skill") setSkills(items as AgentSkill[]);
        else setApps(items as AgentApp[]);
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, listApps, listSkills, open, path, threadId]);

  const items = kind === "skill" ? skills : apps;
  const visibleItems = useMemo(() => {
    const filtered = deferredQuery
      ? items.filter((item) => `${item.name} ${item.description ?? ""}`.toLocaleLowerCase().includes(deferredQuery))
      : items;
    return filtered.slice(0, 100);
  }, [deferredQuery, items]);
  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
      title={kind === "skill" ? "Skills" : "Apps"}
      description={kind === "skill" ? `Attach a ${agentProviderMeta(provider).label} skill` : "Mention a ChatGPT app"}
      className="max-w-lg"
      showCloseButton
    >
      <Command shouldFilter={false}>
      <CommandInput value={query} onValueChange={setQuery} placeholder={kind === "skill" ? "Search skills…" : "Search apps…"} />
      <CommandList>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <CommandEmpty>No {kind === "skill" ? "skills" : "apps"} found.</CommandEmpty>
            <CommandGroup>
              {visibleItems.map((item) => {
                const disabled = kind === "skill"
                  ? !(item as AgentSkill).enabled
                  : !(item as AgentApp).isEnabled || (!(item as AgentApp).isAccessible && !(item as AgentApp).installUrl);
                return (
                  <CommandItem
                    key={kind === "skill" ? (item as AgentSkill).path : (item as AgentApp).id}
                    value={`${item.name} ${item.description ?? ""}`}
                    disabled={disabled}
                    onSelect={() => {
                      if (kind === "skill") onSelectSkill(item as AgentSkill);
                      else {
                        const app = item as AgentApp;
                        if (!app.isAccessible && app.installUrl) void openUrl(app.installUrl);
                        else onSelectApp(app);
                      }
                      onOpenChange(false);
                    }}
                    className="items-start py-2"
                  >
                    {kind === "skill" ? (
                      <Sparkles className="mt-0.5 size-4 text-muted-foreground" />
                    ) : (
                      <AppWindow className="mt-0.5 size-4 text-muted-foreground" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{item.name}</span>
                      {item.description ? (
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-4 text-muted-foreground">
                          {item.description}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
