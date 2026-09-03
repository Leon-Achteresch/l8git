import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Boxes,
  ExternalLink,
  GitFork,
  LoaderCircle,
  PackageCheck,
  PackagePlus,
  PencilLine,
  Plus,
  RefreshCw,
  Save,
  Store,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  CapabilityEmpty,
  CapabilityError,
  CapabilityListButton,
  CapabilityPill,
  CapabilitySectionTitle,
  CapabilitySplit,
  CapabilityStat,
} from "@/components/agents/capabilities/capability-ui";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  capabilityPlugins,
  useAgentCapabilityStore,
} from "@/lib/agents/capability-store";
import type {
  AgentCapabilityMarketplace,
  AgentCapabilityPlugin,
} from "@/lib/agents/capability-types";
import { SpinIcon } from "@/components/motion/kit";

function pluginTitle(plugin: AgentCapabilityPlugin): string {
  return plugin.interface?.displayName || plugin.name || plugin.id;
}

function pluginDescription(plugin: AgentCapabilityPlugin): string {
  return plugin.interface?.shortDescription || plugin.interface?.longDescription || plugin.id;
}

function pluginInitial(plugin: AgentCapabilityPlugin): string {
  return pluginTitle(plugin).slice(0, 1).toLocaleUpperCase();
}

function localManifestPath(plugin: AgentCapabilityPlugin): string | null {
  if (plugin.source.type !== "local") return null;
  const separator = plugin.source.path.includes("\\") && !plugin.source.path.includes("/") ? "\\" : "/";
  return `${plugin.source.path.replace(/[\\/]+$/u, "")}${separator}.codex-plugin${separator}plugin.json`;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function pluginMcpConfig(config: Record<string, unknown> | undefined, pluginId: string, serverName: string): Record<string, unknown> {
  return record(record(record(record(config?.plugins)[pluginId]).mcp_servers)[serverName]);
}

function pluginToolPolicy(config: Record<string, unknown>, toolName: string): { enabled: boolean; mode: "auto" | "prompt" | "writes" | "approve" } {
  const enabledTools = Array.isArray(config.enabled_tools) ? config.enabled_tools.filter((item): item is string => typeof item === "string") : [];
  const disabledTools = Array.isArray(config.disabled_tools) ? config.disabled_tools.filter((item): item is string => typeof item === "string") : [];
  const mode = record(record(config.tools)[toolName]).approval_mode;
  return {
    enabled: !disabledTools.includes(toolName) && (!enabledTools.length || enabledTools.includes(toolName)),
    mode: mode === "prompt" || mode === "writes" || mode === "approve" ? mode : "auto",
  };
}

export function AgentPluginStudio({ query }: { query: string }) {
  const { t } = useTranslation();
  const marketplaces = useAgentCapabilityStore((state) => state.marketplaces);
  const marketplaceErrors = useAgentCapabilityStore((state) => state.marketplaceErrors);
  const featuredIds = useAgentCapabilityStore((state) => state.featuredPluginIds);
  const mcpServers = useAgentCapabilityStore((state) => state.mcpServers);
  const config = useAgentCapabilityStore((state) => state.config?.config);
  const error = useAgentCapabilityStore((state) => state.errors.plugins);
  const busyKey = useAgentCapabilityStore((state) => state.busyKey);
  const details = useAgentCapabilityStore((state) => state.pluginDetails);
  const readPlugin = useAgentCapabilityStore((state) => state.readPlugin);
  const installPlugin = useAgentCapabilityStore((state) => state.installPlugin);
  const uninstallPlugin = useAgentCapabilityStore((state) => state.uninstallPlugin);
  const setPluginEnabled = useAgentCapabilityStore((state) => state.setPluginEnabled);
  const setPluginMcpEnabled = useAgentCapabilityStore((state) => state.setPluginMcpEnabled);
  const setPluginMcpToolPolicy = useAgentCapabilityStore((state) => state.setPluginMcpToolPolicy);
  const addMarketplace = useAgentCapabilityStore((state) => state.addMarketplace);
  const removeMarketplace = useAgentCapabilityStore((state) => state.removeMarketplace);
  const upgradeMarketplace = useAgentCapabilityStore((state) => state.upgradeMarketplace);
  const readTextFile = useAgentCapabilityStore((state) => state.readTextFile);
  const backupAndWriteTextFile = useAgentCapabilityStore((state) => state.backupAndWriteTextFile);
  const plugins = useMemo(() => capabilityPlugins(marketplaces), [marketplaces]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => plugins.filter((plugin) => !normalizedQuery || [
    plugin.id,
    plugin.name,
    plugin.marketplaceName,
    plugin.interface?.displayName ?? "",
    plugin.interface?.shortDescription ?? "",
    ...(plugin.keywords ?? []),
  ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))), [normalizedQuery, plugins]);
  const [listPagination, setListPagination] = useState({ query: normalizedQuery, limit: 80 });
  const listLimit = listPagination.query === normalizedQuery ? listPagination.limit : 80;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AgentCapabilityPlugin | null>(null);
  const [marketplaceRemoveTarget, setMarketplaceRemoveTarget] = useState<AgentCapabilityMarketplace | null>(null);
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  const [marketplaceSource, setMarketplaceSource] = useState("");
  const [marketplaceRef, setMarketplaceRef] = useState("");
  const [marketplaceSparse, setMarketplaceSparse] = useState("");
  const [manifestOpen, setManifestOpen] = useState(false);
  const [manifestText, setManifestText] = useState("");
  const [manifestLoading, setManifestLoading] = useState(false);
  const selected = plugins.find((plugin) => plugin.id === selectedId) ?? filtered[0] ?? null;
  const detail = selected ? details[selected.id] : undefined;
  const visiblePluginIds = useMemo(
    () => new Set(filtered.slice(0, listLimit).map((plugin) => plugin.id)),
    [filtered, listLimit],
  );
  const pluginsByMarketplace = useMemo(() => {
    const grouped = new Map<string, AgentCapabilityPlugin[]>();
    for (const plugin of filtered) {
      const group = grouped.get(plugin.marketplaceName);
      if (group) group.push(plugin);
      else grouped.set(plugin.marketplaceName, [plugin]);
    }
    return grouped;
  }, [filtered]);

  useEffect(() => {
    if (!selectedId && filtered[0]) setSelectedId(filtered[0].id);
    if (selectedId && !plugins.some((plugin) => plugin.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, plugins, selectedId]);

  useEffect(() => {
    if (!selected || detail || !selected.installed) return;
    void readPlugin(selected).catch((candidate) => {
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    });
  }, [detail, readPlugin, selected]);

  const install = async (plugin: AgentCapabilityPlugin) => {
    try {
      const authApps = await installPlugin(plugin);
      toast.success(t("agentCapabilities.plugins.installed"));
      if (authApps.length) toast.info(t("agentCapabilities.plugins.appsNeedAuth", { apps: authApps.join(", ") }));
    } catch (candidate) {
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    }
  };

  const openManifest = async (plugin: AgentCapabilityPlugin) => {
    const path = localManifestPath(plugin);
    if (!path) return;
    setManifestLoading(true);
    setManifestOpen(true);
    try {
      setManifestText(await readTextFile(path));
    } catch (candidate) {
      setManifestOpen(false);
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    } finally {
      setManifestLoading(false);
    }
  };

  const saveManifest = async () => {
    if (!selected) return;
    const path = localManifestPath(selected);
    if (!path) return;
    try {
      JSON.parse(manifestText);
      await backupAndWriteTextFile(path, `${manifestText.trim()}\n`);
      setManifestOpen(false);
      toast.success(t("agentCapabilities.plugins.manifestSaved"));
    } catch (candidate) {
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    }
  };

  return (
    <>
      <CapabilitySplit
        list={(
          <div className="p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <p className="text-[10px] text-muted-foreground">{t("agentCapabilities.itemCount", { count: filtered.length })}</p>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon-xs" className="rounded-md" onClick={() => void upgradeMarketplace().then(() => toast.success(t("agentCapabilities.plugins.marketplacesUpgraded"))).catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))} title={t("agentCapabilities.plugins.upgradeAll")}>
                  <SpinIcon icon={RefreshCw} active={busyKey === "marketplace:all"} className={`size-3.5`} />
                </Button>
                <Button type="button" variant="ghost" size="icon-xs" className="rounded-md" onClick={() => setMarketplaceOpen(true)} title={t("agentCapabilities.plugins.addMarketplace")}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>
            {error ? <CapabilityError message={error} /> : null}
            {marketplaceErrors.map((issue) => <CapabilityError key={`${issue.marketplacePath}:${issue.message}`} message={`${issue.marketplacePath}: ${issue.message}`} />)}
            {marketplaces.map((marketplace) => {
              const marketplacePlugins = (pluginsByMarketplace.get(marketplace.name) ?? [])
                .filter((plugin) => visiblePluginIds.has(plugin.id));
              if (!marketplacePlugins.length) return null;
              return (
                <section key={marketplace.name} className="mb-3">
                  <div className="mb-1 flex items-center gap-2 px-1.5 py-1">
                    <Store className="size-3 text-muted-foreground" />
                    <p className="min-w-0 flex-1 truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{marketplace.displayName || marketplace.name}</p>
                    <Button type="button" variant="ghost" size="icon-xs" onClick={() => setMarketplaceRemoveTarget(marketplace)} className="size-5 text-muted-foreground/60 hover:text-destructive" aria-label={t("agentCapabilities.plugins.removeMarketplace")}><X className="size-3" /></Button>
                  </div>
                  <div className="space-y-0.5">
                    {marketplacePlugins.map((plugin) => (
                      <CapabilityListButton
                        key={plugin.id}
                        selected={plugin.id === selected?.id}
                        icon={<span className="text-[11px] font-semibold" style={{ color: plugin.interface?.brandColor ?? undefined }}>{pluginInitial(plugin)}</span>}
                        title={pluginTitle(plugin)}
                        description={pluginDescription(plugin)}
                        meta={featuredIds.includes(plugin.id) ? <CapabilityPill tone="warning">Featured</CapabilityPill> : undefined}
                        trailing={<span className={`mt-1 block size-1.5 rounded-full ${plugin.installed && plugin.enabled ? "bg-emerald-500" : "bg-muted-foreground/35"}`} />}
                        onClick={() => setSelectedId(plugin.id)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
            {filtered.length > listLimit ? (
              <button
                type="button"
                className="ag-pill mt-2 h-8 w-full justify-center"
                onClick={() => setListPagination({ query: normalizedQuery, limit: listLimit + 100 })}
              >
                {t("agentCapabilities.showMore", { count: Math.min(100, filtered.length - listLimit) })}
              </button>
            ) : null}
          </div>
        )}
        detail={selected ? (
          <div className="pb-8">
            <CapabilitySectionTitle
              eyebrow={`${selected.marketplaceName} · ${selected.source.type}`}
              title={pluginTitle(selected)}
              description={pluginDescription(selected)}
              actions={(
                <>
                  {selected.installed ? (
                    <>
                      <Switch checked={selected.enabled} disabled={busyKey === `plugin:${selected.id}`} onCheckedChange={(checked) => void setPluginEnabled(selected, checked).catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))} aria-label={t("agentCapabilities.enabled")} />
                      {localManifestPath(selected) ? (
                        <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => void openManifest(selected)}><PencilLine className="size-3.5" />{t("agentCapabilities.plugins.editManifest")}</Button>
                      ) : null}
                      <Button type="button" variant="ghost" size="sm" className="rounded-lg text-muted-foreground hover:text-destructive" onClick={() => setRemoveTarget(selected)}><Unplug className="size-3.5" />{t("agentCapabilities.plugins.uninstall")}</Button>
                    </>
                  ) : (
                    <Button type="button" size="sm" className="rounded-lg" disabled={busyKey === `plugin:${selected.id}`} onClick={() => void install(selected)}>
                      {busyKey === `plugin:${selected.id}` ? <SpinIcon icon={LoaderCircle} className="size-3.5" /> : <PackagePlus className="size-3.5" />}
                      {t("agentCapabilities.plugins.install")}
                    </Button>
                  )}
                </>
              )}
            />
            <div className="space-y-6 p-5">
              <div className="grid gap-3 sm:grid-cols-4">
                <CapabilityStat label={t("agentCapabilities.status")} value={selected.installed ? (selected.enabled ? t("agentCapabilities.active") : t("agentCapabilities.inactive")) : t("agentCapabilities.plugins.available")} />
                <CapabilityStat label={t("agentCapabilities.plugins.version")} value={selected.localVersion || selected.version || "—"} />
                <CapabilityStat label={t("agentCapabilities.plugins.authPolicy")} value={selected.authPolicy} />
                <CapabilityStat label={t("agentCapabilities.plugins.availability")} value={selected.availability} />
              </div>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
                <div className="ag-card p-4">
                  <div className="flex items-center gap-2"><Boxes className="size-3.5 text-muted-foreground" /><h3 className="text-xs font-semibold">{t("agentCapabilities.plugins.capabilities")}</h3></div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(selected.interface?.capabilities ?? []).length ? selected.interface?.capabilities.map((capability) => <CapabilityPill key={capability}>{capability}</CapabilityPill>) : <span className="text-[10px] text-muted-foreground">{t("agentCapabilities.plugins.noCapabilities")}</span>}
                  </div>
                  {selected.interface?.longDescription ? <p className="mt-4 text-xs leading-5 text-muted-foreground">{selected.interface.longDescription}</p> : null}
                </div>
                <div className="ag-card p-4">
                  <PackageCheck className="size-4 text-muted-foreground" />
                  <p className="mt-3 text-xs font-medium">{selected.interface?.developerName || selected.marketplaceName}</p>
                  <p className="mt-1 break-all font-mono text-[9px] leading-4 text-muted-foreground">{selected.id}</p>
                  {selected.interface?.websiteUrl ? <Button type="button" variant="link" size="sm" className="mt-2 h-auto px-0 text-[10px]" onClick={() => void openUrl(selected.interface?.websiteUrl ?? "")}>{t("agentCapabilities.openWebsite")}<ExternalLink className="size-3" /></Button> : null}
                </div>
              </section>

              {busyKey === `plugin:${selected.id}:read` && !detail ? (
                <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground"><SpinIcon icon={LoaderCircle} className="size-3.5" />{t("agentCapabilities.plugins.loadingDetails")}</div>
              ) : detail ? (
                <section>
                  <div className="mb-3 flex items-center gap-2"><GitFork className="size-3.5 text-muted-foreground" /><h3 className="text-xs font-semibold">{t("agentCapabilities.plugins.bundleContents")}</h3></div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <CapabilityStat label="Skills" value={detail.skills.length} />
                    <CapabilityStat label="MCP" value={detail.mcpServers.length} />
                    <CapabilityStat label="Apps" value={detail.apps.length + detail.appTemplates.length} />
                    <CapabilityStat label="Hooks" value={detail.hooks.length} />
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {detail.skills.map((skill) => <div key={skill.name} className="flex items-center gap-2 rounded-xl bg-foreground/[0.03] px-3 py-2 ring-1 ring-border/30"><CapabilityPill>skill</CapabilityPill><span className="text-[11px] font-medium">{skill.name}</span><span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{skill.description}</span></div>)}
                    {detail.mcpServers.map((serverName) => {
                      const serverConfig = pluginMcpConfig(config, selected.id, serverName);
                      const runtime = mcpServers.find((server) => server.name === serverName || server.name.endsWith(`/${serverName}`) || server.name.endsWith(`:${serverName}`));
                      const serverEnabled = serverConfig.enabled !== false;
                      return (
                        <div key={serverName} className="ag-card overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2.5">
                            <CapabilityPill>MCP</CapabilityPill>
                            <code className="min-w-0 flex-1 truncate text-[10px]">{serverName}</code>
                            <span className="text-[9px] text-muted-foreground">{runtime ? `${Object.keys(runtime.tools).length} tools` : t("agentCapabilities.plugins.runtimeOffline")}</span>
                            <Switch size="sm" checked={serverEnabled} disabled={busyKey === `plugin:${selected.id}:mcp:${serverName}`} onCheckedChange={(checked) => void setPluginMcpEnabled(selected.id, serverName, checked).catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))} />
                          </div>
                          {runtime && Object.keys(runtime.tools).length ? (
                            <div className="border-t border-border/30">
                              {Object.entries(runtime.tools).map(([toolName, tool]) => {
                                const policy = pluginToolPolicy(serverConfig, toolName);
                                const toolBusy = busyKey === `plugin:${selected.id}:mcp:${serverName}:${toolName}`;
                                return (
                                  <div key={toolName} className="grid gap-2 border-b border-border/25 px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_7rem_2rem]">
                                    <div className="min-w-0"><p className="truncate font-mono text-[10px] font-medium">{tool.title || toolName}</p><p className="truncate text-[9px] text-muted-foreground">{tool.description}</p></div>
                                    <Select value={policy.mode} disabled={toolBusy} onValueChange={(value) => void setPluginMcpToolPolicy(selected.id, serverName, toolName, policy.enabled, value as typeof policy.mode).catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))}>
                                      <SelectTrigger size="sm" className="w-full">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="auto">Auto</SelectItem>
                                        <SelectItem value="prompt">Prompt</SelectItem>
                                        <SelectItem value="writes">Writes</SelectItem>
                                        <SelectItem value="approve">Approve</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <Switch size="sm" checked={policy.enabled} disabled={toolBusy} onCheckedChange={(checked) => void setPluginMcpToolPolicy(selected.id, serverName, toolName, checked, policy.mode).catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))} />
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        ) : (
          <CapabilityEmpty title={t("agentCapabilities.plugins.empty")} description={t("agentCapabilities.plugins.emptyHint")} action={<Button type="button" size="sm" className="rounded-lg" onClick={() => setMarketplaceOpen(true)}><Plus className="size-3.5" />{t("agentCapabilities.plugins.addMarketplace")}</Button>} />
        )}
      />

      <Dialog open={marketplaceOpen} onOpenChange={setMarketplaceOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{t("agentCapabilities.plugins.addMarketplace")}</DialogTitle><DialogDescription>{t("agentCapabilities.plugins.addMarketplaceHint")}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="marketplace-source">{t("agentCapabilities.plugins.source")}</Label><Input id="marketplace-source" value={marketplaceSource} onChange={(event) => setMarketplaceSource(event.target.value)} placeholder="https://github.com/org/marketplace.git" className="font-mono text-xs" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="marketplace-ref">Git ref</Label><Input id="marketplace-ref" value={marketplaceRef} onChange={(event) => setMarketplaceRef(event.target.value)} placeholder="main" className="font-mono text-xs" /></div>
              <div className="space-y-1.5"><Label htmlFor="marketplace-sparse">Sparse paths</Label><Input id="marketplace-sparse" value={marketplaceSparse} onChange={(event) => setMarketplaceSparse(event.target.value)} placeholder="plugins/core, plugins/team" className="font-mono text-xs" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMarketplaceOpen(false)}>{t("common.cancel")}</Button>
            <Button type="button" disabled={busyKey === "marketplace:add" || !marketplaceSource.trim()} onClick={() => void addMarketplace(marketplaceSource, marketplaceRef || undefined, marketplaceSparse.split(",").map((item) => item.trim()).filter(Boolean)).then(() => { setMarketplaceOpen(false); setMarketplaceSource(""); setMarketplaceRef(""); setMarketplaceSparse(""); toast.success(t("agentCapabilities.plugins.marketplaceAdded")); }).catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))}>
              {busyKey === "marketplace:add" ? <SpinIcon icon={LoaderCircle} className="size-3.5" /> : <Plus className="size-3.5" />}{t("common.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manifestOpen} onOpenChange={setManifestOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{t("agentCapabilities.plugins.editManifest")}</DialogTitle><DialogDescription>{selected ? localManifestPath(selected) : ""}</DialogDescription></DialogHeader>
          {manifestLoading ? <div className="flex min-h-64 items-center justify-center"><SpinIcon icon={LoaderCircle} className="size-4" /></div> : <Textarea value={manifestText} onChange={(event) => setManifestText(event.target.value)} spellCheck={false} className="min-h-80 resize-y font-mono text-[11px] leading-5" />}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setManifestOpen(false)}>{t("common.cancel")}</Button><Button type="button" disabled={manifestLoading || Boolean(busyKey?.startsWith("file:"))} onClick={() => void saveManifest()}><Save className="size-3.5" />{t("common.save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("agentCapabilities.plugins.uninstallTitle")}</AlertDialogTitle><AlertDialogDescription>{t("agentCapabilities.plugins.uninstallDescription", { name: removeTarget ? pluginTitle(removeTarget) : "" })}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { if (!removeTarget) return; void uninstallPlugin(removeTarget).then(() => toast.success(t("agentCapabilities.plugins.uninstalled"))).catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate))).finally(() => setRemoveTarget(null)); }}><Trash2 className="size-3.5" />{t("agentCapabilities.plugins.uninstall")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(marketplaceRemoveTarget)} onOpenChange={(open) => !open && setMarketplaceRemoveTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("agentCapabilities.plugins.removeMarketplace")}</AlertDialogTitle><AlertDialogDescription>{t("agentCapabilities.plugins.removeMarketplaceHint", { name: marketplaceRemoveTarget?.displayName || marketplaceRemoveTarget?.name })}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { if (!marketplaceRemoveTarget) return; void removeMarketplace(marketplaceRemoveTarget.name).then(() => toast.success(t("agentCapabilities.plugins.marketplaceRemoved"))).catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate))).finally(() => setMarketplaceRemoveTarget(null)); }}>{t("common.remove")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  );
}
