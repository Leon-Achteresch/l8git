import { ArrowLeft, Blocks, Bot, Command, PlugZap, RefreshCw, Sparkles, Webhook } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ClaudeCodeLogo } from "@/components/brand/agent-logos";
import { ProgressiveCapabilityList } from "@/components/agents/capabilities/capability-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import type { AgentCapabilitySection } from "@/lib/agents/capability-types";
import { claudeCapabilitySnapshot } from "@/lib/agents/providers/claude/chat-store";
import type { AgentHook, AgentMcpServer, AgentPlugin, AgentSkill } from "@/lib/agents/types";
import { cn } from "@/lib/utils";

type Section = "skills" | "commands" | "agents" | "mcp" | "plugins" | "hooks";
type Entry = { id: string; title: string; description: string; meta?: string };
type ClaudeCapabilityData = {
  skills: AgentSkill[];
  commands: Array<{ name: string; description: string; argumentHint: string }>;
  agents: Array<{ name: string; description: string }>;
  mcp: AgentMcpServer[];
  plugins: AgentPlugin[];
  hooks: AgentHook[];
};

const capabilityDataCache = new Map<string, { expiresAt: number; data: ClaudeCapabilityData }>();
const capabilityDataPromises = new Map<string, Promise<ClaudeCapabilityData>>();

async function fetchCapabilityData(
  path: string,
  listPlugins: (path: string) => Promise<AgentPlugin[]>,
  force = false,
): Promise<ClaudeCapabilityData> {
  const cached = capabilityDataCache.get(path);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.data;
  const pending = capabilityDataPromises.get(path);
  if (pending) return pending;
  const promise = (async () => {
    const [snapshot, plugins] = await Promise.all([
      claudeCapabilitySnapshot(path, force),
      listPlugins(path).catch(() => cached?.data.plugins ?? []),
    ]);
    const data: ClaudeCapabilityData = {
      skills: snapshot.skills,
      commands: snapshot.commands,
      agents: snapshot.agents,
      mcp: snapshot.mcpServers,
      plugins,
      hooks: snapshot.hooks,
    };
    if (capabilityDataCache.size >= 8 && !capabilityDataCache.has(path)) {
      capabilityDataCache.delete(capabilityDataCache.keys().next().value ?? "");
    }
    capabilityDataCache.set(path, { expiresAt: Date.now() + 10_000, data });
    return data;
  })();
  capabilityDataPromises.set(path, promise);
  try {
    return await promise;
  } finally {
    if (capabilityDataPromises.get(path) === promise) capabilityDataPromises.delete(path);
  }
}

const sections: Array<{ id: Section; label: string; Icon: typeof Sparkles }> = [
  { id: "skills", label: "Skills", Icon: Sparkles },
  { id: "commands", label: "Commands", Icon: Command },
  { id: "agents", label: "Subagents", Icon: Bot },
  { id: "mcp", label: "MCP", Icon: PlugZap },
  { id: "plugins", label: "Plugins", Icon: Blocks },
  { id: "hooks", label: "Hooks", Icon: Webhook },
];

function repoName(path: string) {
  return path.split(/[\\/]/u).pop() ?? path;
}

export function ClaudeCapabilityCenter({
  path,
  initialSection = "skills",
  onBack,
}: {
  path: string;
  initialSection?: AgentCapabilitySection;
  onBack: () => void;
}) {
  const listPlugins = useAgentChatStore((state) => state.listPlugins);
  const [section, setSection] = useState<Section>(initialSection === "apps" ? "agents" : initialSection);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef(0);
  const [data, setData] = useState<ClaudeCapabilityData>({ skills: [], commands: [], agents: [], mcp: [], plugins: [], hooks: [] });

  const load = useCallback(async (force = false) => {
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const nextData = await fetchCapabilityData(path, listPlugins, force);
      if (request === requestRef.current) setData(nextData);
    } catch (error) {
      if (request === requestRef.current) toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [listPlugins, path]);

  useEffect(() => {
    void load();
  }, [load]);

  const entries = useMemo<Entry[]>(() => {
    const raw: Entry[] = section === "skills"
      ? data.skills.map((item) => ({ id: item.path || item.name, title: item.name, description: item.description, meta: item.path }))
      : section === "commands"
        ? data.commands.map((item) => ({ id: item.name, title: `/${item.name}`, description: item.description, meta: item.argumentHint }))
        : section === "agents"
          ? data.agents.map((item) => ({ id: item.name, title: item.name, description: item.description, meta: "Claude subagent" }))
          : section === "mcp"
            ? data.mcp.map((item) => ({ id: item.name, title: item.name, description: item.tools.length ? item.tools.join(", ") : "No tools reported", meta: item.authStatus }))
            : section === "plugins"
              ? data.plugins.map((item) => ({ id: item.id, title: item.name, description: item.enabled ? "Enabled" : "Disabled", meta: item.availability }))
              : data.hooks.map((item) => ({ id: item.key, title: item.eventName, description: item.key, meta: item.trustStatus }));
    const normalized = deferredQuery.trim().toLocaleLowerCase();
    return normalized ? raw.filter((item) => `${item.title} ${item.description} ${item.meta ?? ""}`.toLocaleLowerCase().includes(normalized)) : raw;
  }, [data, deferredQuery, section]);

  const counts: Record<Section, number> = {
    skills: data.skills.length,
    commands: data.commands.length,
    agents: data.agents.length,
    mcp: data.mcp.length,
    plugins: data.plugins.length,
    hooks: data.hooks.length,
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border/50 bg-background/95">
        <div className="flex h-12 items-center gap-3 px-3.5">
          <Button type="button" variant="ghost" size="icon-sm" className="rounded-full text-muted-foreground" onClick={onBack} title="Back to chat">
            <ArrowLeft className="size-3.5" />
          </Button>
          <span className="grid size-7 place-items-center rounded-lg bg-foreground/[0.06] ring-1 ring-border/40"><ClaudeCodeLogo className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold tracking-tight">Claude Code capabilities</p>
            <p className="truncate text-[9px] text-muted-foreground">{repoName(path)} · live from the installed CLI</p>
          </div>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search capabilities…" className="hidden h-8 w-52 rounded-lg text-[11px] sm:block" />
          <Button type="button" variant="ghost" size="icon-sm" className="rounded-full text-muted-foreground" disabled={loading} onClick={() => void load(true)} title="Refresh">
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
        </div>
        <nav className="flex h-10 items-end gap-1 overflow-x-auto px-3.5 [scrollbar-width:none]" aria-label="Claude Code capabilities">
          {sections.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={section === id}
              onClick={() => setSection(id)}
              className={cn(
                "relative flex h-9 shrink-0 items-center gap-1.5 rounded-t-lg px-2.5 text-[11px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                section === id && "bg-foreground/[0.045] text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#d97757]",
              )}
            >
              <Icon className="size-3.5" /> {label}
              <span className="rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-[9px] tabular-nums">{counts[id]}</span>
            </button>
          ))}
        </nav>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto grid max-w-4xl gap-2 sm:grid-cols-2">
          <ProgressiveCapabilityList
            items={entries}
            getKey={(entry) => entry.id}
            resetKey={`${section}:${deferredQuery}:${entries.length}`}
            moreLabel={(count) => `Show ${count} more`}
            renderItem={(entry) => (
            <article key={entry.id} className="rounded-xl border border-border/55 bg-card/45 p-3.5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[#d97757]/10 text-[#d97757]">
                  {(() => { const Icon = sections.find((item) => item.id === section)?.Icon ?? Blocks; return <Icon className="size-4" />; })()}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-xs font-medium">{entry.title}</h3>
                  <p className="mt-1 line-clamp-3 text-[10px] leading-4 text-muted-foreground">{entry.description || "No description"}</p>
                  {entry.meta ? <p className="mt-2 truncate font-mono text-[9px] text-muted-foreground/70">{entry.meta}</p> : null}
                </div>
              </div>
            </article>
            )}
          />
        </div>
        {!loading && entries.length === 0 ? (
          <div className="grid h-56 place-items-center text-center text-xs text-muted-foreground">
            <div><Blocks className="mx-auto mb-3 size-5" /><p>No matching Claude Code capabilities.</p></div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
