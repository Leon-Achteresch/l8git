import { invoke } from "@tauri-apps/api/core";
import { ArrowRightLeft, Blocks, Bot, Command, Pencil, PlugZap, Power, RefreshCw, Sparkles, Store, Trash2, Webhook } from "lucide-react";
import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ClaudeCodeLogo, OpenCodeLogo } from "@/components/brand/agent-logos";
import { ProgressiveCapabilityList } from "@/components/agents/capabilities/capability-ui";
import { CapabilityStudioShell } from "@/components/agents/capabilities/capability-studio-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import type { AgentCapabilitySection } from "@/lib/agents/capability-types";
import { claudeCapabilitySnapshot } from "@/lib/agents/providers/claude/chat-store";
import { openCodeCapabilitySnapshot } from "@/lib/agents/providers/opencode/chat-store";
import type { AgentHook, AgentMcpServer, AgentPlugin, AgentSkill } from "@/lib/agents/types";
import { AgentProviderMark } from "@/components/agents/ui/agent-provider-mark";
import { AnimatePresence, m } from "motion/react";
import { SPRING_PANEL } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";
import { SpinIcon } from "@/components/motion/kit";

const CapabilitySyncStudio = lazy(() => import("@/components/agents/capabilities/capability-sync-studio").then(
  (module) => ({ default: module.CapabilitySyncStudio }),
));
const CapabilityMarketplace = lazy(() => import("@/components/agents/capabilities/capability-marketplace").then(
  (module) => ({ default: module.CapabilityMarketplace }),
));

type Section = "skills" | "commands" | "agents" | "mcp" | "plugins" | "hooks" | "sync" | "market";
type CapabilityProvider = "claude" | "opencode";
type Entry = {
  id: string;
  title: string;
  description: string;
  meta?: string;
  filePath?: string;
  toggle?: { enabled: boolean; label: string; run: (next: boolean) => Promise<unknown> };
  remove?: { label: string; run: () => Promise<unknown> };
};
type CapabilityFile = { name: string; description: string; path: string; scope: string };
type ClaudeCapabilityData = {
  skills: AgentSkill[];
  commands: Array<{ name: string; description: string; argumentHint: string }>;
  agents: Array<{ name: string; description: string }>;
  mcp: AgentMcpServer[];
  plugins: AgentPlugin[];
  hooks: AgentHook[];
  files: Record<"commands" | "agents", CapabilityFile[]>;
};

const capabilityDataCache = new Map<string, { expiresAt: number; data: ClaudeCapabilityData }>();
const capabilityDataPromises = new Map<string, Promise<ClaudeCapabilityData>>();

async function fetchCapabilityData(
  provider: CapabilityProvider,
  path: string,
  listPlugins: (path: string) => Promise<AgentPlugin[]>,
  force = false,
): Promise<ClaudeCapabilityData> {
  const key = `${provider}:${path}`;
  const cached = capabilityDataCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.data;
  const pending = capabilityDataPromises.get(key);
  if (pending) return pending;
  const promise = (async () => {
    const snapshotOf = provider === "opencode" ? openCodeCapabilitySnapshot : claudeCapabilitySnapshot;
    const listFiles = (kind: "commands" | "agents") => provider === "claude"
      ? invoke<CapabilityFile[]>("claude_list_capability_files", { path, kind }).catch(() => [])
      : Promise.resolve<CapabilityFile[]>([]);
    const [snapshot, plugins, commandFiles, agentFiles] = await Promise.all([
      snapshotOf(path, force),
      listPlugins(path).catch(() => cached?.data.plugins ?? []),
      listFiles("commands"),
      listFiles("agents"),
    ]);
    const data: ClaudeCapabilityData = {
      skills: snapshot.skills,
      commands: snapshot.commands,
      agents: snapshot.agents,
      mcp: snapshot.mcpServers,
      plugins,
      hooks: snapshot.hooks,
      files: { commands: commandFiles, agents: agentFiles },
    };
    if (capabilityDataCache.size >= 8 && !capabilityDataCache.has(key)) {
      capabilityDataCache.delete(capabilityDataCache.keys().next().value ?? "");
    }
    capabilityDataCache.set(key, { expiresAt: Date.now() + 10_000, data });
    return data;
  })();
  capabilityDataPromises.set(key, promise);
  try {
    return await promise;
  } finally {
    if (capabilityDataPromises.get(key) === promise) capabilityDataPromises.delete(key);
  }
}

const sections: Array<{ id: Section; label: string; Icon: typeof Sparkles }> = [
  { id: "skills", label: "Skills", Icon: Sparkles },
  { id: "commands", label: "Commands", Icon: Command },
  { id: "agents", label: "Subagents", Icon: Bot },
  { id: "mcp", label: "MCP", Icon: PlugZap },
  { id: "plugins", label: "Plugins", Icon: Blocks },
  { id: "hooks", label: "Hooks", Icon: Webhook },
  { id: "sync", label: "Sync", Icon: ArrowRightLeft },
  { id: "market", label: "Marktplatz", Icon: Store },
];

function repoName(path: string) {
  return path.split(/[\\/]/u).pop() ?? path;
}

export function ClaudeCapabilityCenter({
  path,
  initialSection = "skills",
  provider = "claude",
  onBack,
}: {
  path: string;
  initialSection?: AgentCapabilitySection;
  provider?: CapabilityProvider;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const isOpenCode = provider === "opencode";
  const ProviderLogo = isOpenCode ? OpenCodeLogo : ClaudeCodeLogo;
  const providerLabel = isOpenCode ? "OpenCode" : "Claude Code";
  const listPlugins = useAgentChatStore((state) => state.listPlugins);
  const [section, setSection] = useState<Section>(initialSection === "apps" ? "agents" : initialSection);

  useEffect(() => {
    setSection(initialSection === "apps" ? "agents" : initialSection);
  }, [initialSection]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef(0);
  const [data, setData] = useState<ClaudeCapabilityData>({ skills: [], commands: [], agents: [], mcp: [], plugins: [], hooks: [], files: { commands: [], agents: [] } });
  const [editing, setEditing] = useState<{ entry: Entry; text: string } | null>(null);
  const [removing, setRemoving] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (force = false) => {
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const nextData = await fetchCapabilityData(provider, path, listPlugins, force);
      if (request === requestRef.current) setData(nextData);
    } catch (error) {
      if (request === requestRef.current) toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [listPlugins, path, provider]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(message);
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [load]);

  const openEditor = useCallback(async (entry: Entry) => {
    if (!entry.filePath) return;
    try {
      const text = await invoke<string>("claude_read_capability_file", { path, file: entry.filePath });
      setEditing({ entry, text });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [path]);

  const entries = useMemo<Entry[]>(() => {
    if (section === "sync" || section === "market") return [];
    const managed = provider === "claude";
    const fileFor = (kind: "commands" | "agents", name: string) =>
      managed ? data.files[kind].find((file) => file.name === name)?.path : undefined;
    const deletable = (filePath?: string) => filePath
      ? { label: "Löschen", run: () => invoke("claude_delete_capability_file", { path, file: filePath }) }
      : undefined;
    const raw: Entry[] = section === "skills"
      ? data.skills.map((item) => {
          const filePath = managed && item.scope !== "plugin" ? item.path : undefined;
          return {
            id: item.path || item.name,
            title: item.name,
            description: item.description,
            meta: item.path,
            filePath,
            remove: deletable(filePath),
          };
        })
      : section === "commands"
        ? data.commands.map((item) => {
            const filePath = fileFor("commands", item.name);
            return {
              id: item.name,
              title: `/${item.name}`,
              description: item.description,
              meta: item.argumentHint,
              filePath,
              remove: deletable(filePath),
            };
          })
        : section === "agents"
          ? data.agents.map((item) => {
              const filePath = fileFor("agents", item.name);
              return {
                id: item.name,
                title: item.name,
                description: item.description,
                meta: isOpenCode ? "OpenCode agent" : "Claude subagent",
                filePath,
                remove: deletable(filePath),
              };
            })
          : section === "mcp"
            ? data.mcp.map((item) => ({
                id: item.name,
                title: item.name,
                description: item.tools.length ? item.tools.join(", ") : "No tools reported",
                meta: item.authStatus,
                remove: managed
                  ? { label: "MCP-Server entfernen", run: () => invoke("claude_mcp_remove", { path, name: item.name }) }
                  : undefined,
              }))
            : section === "plugins"
              ? data.plugins.map((item) => ({
                  id: item.id,
                  title: item.name,
                  description: item.enabled ? "Enabled" : "Disabled",
                  meta: item.availability,
                  toggle: managed
                    ? {
                        enabled: item.enabled,
                        label: "Plugin",
                        run: (next: boolean) => invoke("claude_set_plugin_enabled", { path, plugin: item.id, enabled: next }),
                      }
                    : undefined,
                  remove: managed && item.installed
                    ? { label: "Plugin deinstallieren", run: () => invoke("claude_uninstall_plugin", { path, plugin: item.id }) }
                    : undefined,
                }))
              : data.hooks.map((item) => ({
                  id: item.key,
                  title: item.eventName,
                  description: item.command || item.key,
                  meta: item.matcher ? `${item.trustStatus} · ${item.matcher}` : item.trustStatus,
                  filePath: managed ? item.source : undefined,
                  toggle: managed && item.source
                    ? {
                        enabled: item.enabled,
                        label: "Hook",
                        run: (next: boolean) => invoke("claude_set_hook_disabled", {
                          path,
                          source: item.source,
                          key: item.key,
                          disabled: !next,
                        }),
                      }
                    : undefined,
                }));
    const normalized = deferredQuery.trim().toLocaleLowerCase();
    return normalized ? raw.filter((item) => `${item.title} ${item.description} ${item.meta ?? ""}`.toLocaleLowerCase().includes(normalized)) : raw;
  }, [data, deferredQuery, isOpenCode, path, provider, section]);

  const counts: Partial<Record<Section, number>> = {
    skills: data.skills.length,
    commands: data.commands.length,
    agents: data.agents.length,
    mcp: data.mcp.length,
    plugins: data.plugins.length,
    hooks: data.hooks.length,
  };

  return (
    <CapabilityStudioShell
      title={`${providerLabel} Capabilities`}
      subtitle={`${repoName(path)} · live von der installierten CLI`}
      mark={(
        <AgentProviderMark working={loading} label={providerLabel} className="shrink-0">
          <ProviderLogo />
        </AgentProviderMark>
      )}
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder={t("agentCapabilities.search")}
      onBack={onBack}
      backLabel={t("agentCapabilities.backToChat")}
      actions={(
        <Button type="button" variant="ghost" size="sm" className="h-9 gap-1.5 rounded-lg px-2.5 text-[12px]" disabled={loading} onClick={() => void load(true)}>
          <SpinIcon icon={RefreshCw} active={loading} className="size-3.5" />
          {t("common.refresh")}
        </Button>
      )}
      tabs={sections.map(({ id, label, Icon }) => ({
        id,
        label,
        icon: <Icon className="size-3.5" />,
        count: counts[id],
      }))}
      tabValue={section}
      onTabChange={(id) => setSection(id as Section)}
      tabsLabel={`${providerLabel} capabilities`}
    >
      {section === "sync" || section === "market" ? (
        <Suspense fallback={<div className="grid h-full place-items-center text-xs text-muted-foreground">Capability Studio…</div>}>
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={section}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SPRING_PANEL}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              {section === "sync" ? (
                <CapabilitySyncStudio path={path} query={deferredQuery} />
              ) : (
                <CapabilityMarketplace path={path} query={deferredQuery} />
              )}
            </m.div>
          </AnimatePresence>
        </Suspense>
      ) : (
      <div className="ag-scroll min-h-0 flex-1 overflow-y-auto p-5">
        <div className="ag-studio-cards">
          <ProgressiveCapabilityList
            items={entries}
            getKey={(entry) => entry.id}
            resetKey={`${section}:${deferredQuery}:${entries.length}`}
            moreLabel={(count) => `Show ${count} more`}
            renderItem={(entry) => (
            <m.article
              key={entry.id}
              className="ag-studio-card"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -1 }}
              transition={SPRING_PANEL}
            >
              <div className="flex min-h-0 flex-1 items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#d97757]/10 text-[#d97757]">
                  {(() => { const Icon = sections.find((item) => item.id === section)?.Icon ?? Blocks; return <Icon className="size-4" />; })()}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[14px] font-semibold tracking-tight">{entry.title}</h3>
                  <p className="ag-muted mt-1.5 line-clamp-3 text-[12px] leading-5">{entry.description || "No description"}</p>
                </div>
                {entry.filePath || entry.toggle || entry.remove ? (
                  <div className="flex shrink-0 items-center gap-0.5">
                    {entry.toggle ? (
                      <button
                        type="button"
                        className={cn("ag-icon-btn", entry.toggle.enabled && "text-emerald-500")}
                        disabled={busy}
                        title={entry.toggle.enabled ? `${entry.toggle.label} deaktivieren` : `${entry.toggle.label} aktivieren`}
                        aria-label={entry.toggle.enabled ? `${entry.toggle.label} deaktivieren` : `${entry.toggle.label} aktivieren`}
                        onClick={() => {
                          const toggle = entry.toggle;
                          if (!toggle) return;
                          void run(
                            () => toggle.run(!toggle.enabled),
                            toggle.enabled ? `${toggle.label} deaktiviert` : `${toggle.label} aktiviert`,
                          );
                        }}
                      >
                        <Power className="size-3.5" />
                      </button>
                    ) : null}
                    {entry.filePath ? (
                      <button
                        type="button"
                        className="ag-icon-btn"
                        disabled={busy}
                        title="Bearbeiten"
                        aria-label="Bearbeiten"
                        onClick={() => void openEditor(entry)}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    ) : null}
                    {entry.remove ? (
                      <button
                        type="button"
                        className="ag-icon-btn text-rose-500"
                        disabled={busy}
                        title={entry.remove.label}
                        aria-label={entry.remove.label}
                        onClick={() => setRemoving(entry)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {entry.meta ? <p className="ag-faint mt-auto truncate pt-3 font-mono text-[11px]">{entry.meta}</p> : null}
            </m.article>
            )}
          />
        </div>
        {!loading && entries.length === 0 ? (
          <div className="grid h-56 place-items-center text-center text-xs text-muted-foreground">
            <div><Blocks className="mx-auto mb-3 size-5" /><p>No matching {providerLabel} capabilities.</p></div>
          </div>
        ) : null}
      </div>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing?.entry.title}</DialogTitle>
            <DialogDescription className="truncate font-mono text-[10px]">{editing?.entry.filePath}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={editing?.text ?? ""}
            onChange={(event) => setEditing((current) => current && { ...current, text: event.target.value })}
            spellCheck={false}
            className="h-[52vh] resize-none font-mono text-[11px] leading-5"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Abbrechen</Button>
            <Button
              disabled={busy}
              onClick={() => {
                const current = editing;
                if (!current?.entry.filePath) return;
                setEditing(null);
                void run(
                  () => invoke("claude_write_capability_file", {
                    path,
                    file: current.entry.filePath,
                    contents: current.text,
                  }),
                  "Gespeichert",
                );
              }}
            >
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{removing?.remove?.label}</AlertDialogTitle>
            <AlertDialogDescription>
              „{removing?.title}“ wird endgültig entfernt. Das lässt sich nicht rückgängig machen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = removing?.remove;
                if (!target) return;
                setRemoving(null);
                void run(target.run, `${target.label}: erledigt`);
              }}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CapabilityStudioShell>
  );
}
