import {
  AppWindow,
  ArrowRightLeft,
  Blocks,
  Download,
  FileCode2,
  Import,
  LoaderCircle,
  PlugZap,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Store,
  Webhook,
} from "lucide-react";
import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityLoading } from "@/components/agents/capabilities/capability-ui";
import { CapabilityStudioShell } from "@/components/agents/capabilities/capability-studio-shell";
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
import { capabilityPlugins, useAgentCapabilityStore } from "@/lib/agents/capability-store";
import type { AgentCapabilitySection } from "@/lib/agents/capability-types";
import { CodexLogo } from "@/components/brand/agent-logos";
import { AgentProviderMark } from "@/components/agents/ui/agent-provider-mark";
import { AnimatePresence, m } from "motion/react";
import { SPRING_PANEL } from "@/lib/motion/ease";
import { SpinIcon } from "@/components/motion/kit";
import { AgDot } from "@/components/agents/ui/ag-dot";

const AgentImportDialog = lazy(() => import("@/components/agents/chat/agent-import-dialog").then(
  (module) => ({ default: module.AgentImportDialog }),
));
const AgentSkillStudio = lazy(() => import("@/components/agents/capabilities/agent-skill-studio").then(
  (module) => ({ default: module.AgentSkillStudio }),
));
const AgentMcpStudio = lazy(() => import("@/components/agents/capabilities/agent-mcp-studio").then(
  (module) => ({ default: module.AgentMcpStudio }),
));
const AgentPluginStudio = lazy(() => import("@/components/agents/capabilities/agent-plugin-studio").then(
  (module) => ({ default: module.AgentPluginStudio }),
));
const AgentAppStudio = lazy(() => import("@/components/agents/capabilities/agent-app-studio").then(
  (module) => ({ default: module.AgentAppStudio }),
));
const AgentHookStudio = lazy(() => import("@/components/agents/capabilities/agent-hook-studio").then(
  (module) => ({ default: module.AgentHookStudio }),
));
const CapabilitySyncStudio = lazy(() => import("@/components/agents/capabilities/capability-sync-studio").then(
  (module) => ({ default: module.CapabilitySyncStudio }),
));
const CapabilityMarketplace = lazy(() => import("@/components/agents/capabilities/capability-marketplace").then(
  (module) => ({ default: module.CapabilityMarketplace }),
));

const SECTIONS: Array<{
  id: AgentCapabilitySection;
  Icon: typeof Sparkles;
}> = [
  { id: "skills", Icon: Sparkles },
  { id: "mcp", Icon: PlugZap },
  { id: "plugins", Icon: Blocks },
  { id: "apps", Icon: AppWindow },
  { id: "hooks", Icon: Webhook },
  { id: "sync", Icon: ArrowRightLeft },
  { id: "market", Icon: Store },
];

function repoName(path: string): string {
  return path.split(/[\\/]/u).pop() ?? path;
}

function localPluginManifestPath(plugin: ReturnType<typeof capabilityPlugins>[number]): string | null {
  if (plugin.source.type !== "local") return null;
  const separator = plugin.source.path.includes("\\") && !plugin.source.path.includes("/") ? "\\" : "/";
  return `${plugin.source.path.replace(/[\\/]+$/u, "")}${separator}.codex-plugin${separator}plugin.json`;
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function settleLimited<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = 6,
): Promise<Array<PromiseSettledResult<R>>> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

export function AgentCapabilityCenter({
  path,
  initialSection = "skills",
  onBack,
}: {
  path: string;
  initialSection?: AgentCapabilitySection;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [section, setSection] = useState<AgentCapabilitySection>(initialSection);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [importOpen, setImportOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configEditorPath, setConfigEditorPath] = useState<string | null>(null);
  const [configEditorText, setConfigEditorText] = useState("");
  const [configEditorLoading, setConfigEditorLoading] = useState(false);
  const loading = useAgentCapabilityStore((state) => state.loading);
  const loadedAt = useAgentCapabilityStore((state) => state.loadedAt);
  const storePath = useAgentCapabilityStore((state) => state.path);
  const skills = useAgentCapabilityStore((state) => state.skills);
  const mcpServers = useAgentCapabilityStore((state) => state.mcpServers);
  const marketplaces = useAgentCapabilityStore((state) => state.marketplaces);
  const apps = useAgentCapabilityStore((state) => state.apps);
  const hooks = useAgentCapabilityStore((state) => state.hooks.hooks);
  const config = useAgentCapabilityStore((state) => state.config);
  const load = useAgentCapabilityStore((state) => state.load);
  const refresh = useAgentCapabilityStore((state) => state.refresh);
  const ensureTextFile = useAgentCapabilityStore((state) => state.ensureTextFile);
  const backupAndWriteTextFile = useAgentCapabilityStore((state) => state.backupAndWriteTextFile);
  const readSkillDraft = useAgentCapabilityStore((state) => state.readSkillDraft);
  const readTextFile = useAgentCapabilityStore((state) => state.readTextFile);
  const plugins = useMemo(() => capabilityPlugins(marketplaces), [marketplaces]);
  const counts: Partial<Record<AgentCapabilitySection, number>> = {
    skills: skills.length,
    mcp: mcpServers.length,
    plugins: plugins.length,
    apps: apps.length,
    hooks: hooks.length,
  };

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    void load(path).catch((candidate) => {
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    });
  }, [load, path]);

  const exportSnapshot = async () => {
    const stamp = new Date().toISOString();
    const hookSourcePaths = [...new Set(hooks.map((hook) => hook.sourcePath).filter(Boolean))];
    const manifestPaths = [...new Set(plugins.map(localPluginManifestPath).filter((candidate): candidate is string => Boolean(candidate)))];
    const [skillDraftResults, hookSourceResults, manifestResults] = await Promise.all([
      settleLimited(skills, async (skill) => ({
        path: skill.path,
        enabled: skill.enabled,
        draft: await readSkillDraft(skill),
      })),
      settleLimited(hookSourcePaths, async (sourcePath) => ({
        path: sourcePath,
        contents: await readTextFile(sourcePath),
      })),
      settleLimited(manifestPaths, async (manifestPath) => ({
        path: manifestPath,
        contents: await readTextFile(manifestPath),
      })),
    ]);
    const exportWarnings = [
      ...skillDraftResults.flatMap((result, index) => result.status === "rejected" ? [{
        capability: "skill",
        path: skills[index]?.path ?? "unknown",
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      }] : []),
      ...hookSourceResults.flatMap((result, index) => result.status === "rejected" ? [{
        capability: "hook-source",
        path: hookSourcePaths[index] ?? "unknown",
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      }] : []),
      ...manifestResults.flatMap((result, index) => result.status === "rejected" ? [{
        capability: "plugin-manifest",
        path: manifestPaths[index] ?? "unknown",
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      }] : []),
    ];
    downloadJson(`l8git-capabilities-${repoName(path)}-${stamp.slice(0, 10)}.json`, {
      format: "l8git-capability-snapshot",
      version: 2,
      exportedAt: stamp,
      repository: path,
      skills,
      skillDrafts: skillDraftResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []),
      hookSources: hookSourceResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []),
      localPluginManifests: manifestResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []),
      exportWarnings,
      mcpServers,
      marketplaces,
      apps,
      hooks,
      effectiveConfig: config?.config ?? {},
      configLayers: config?.layers ?? [],
    });
    if (exportWarnings.length) toast.warning(t("agentCapabilities.exportedWithWarnings", { count: exportWarnings.length }));
    else toast.success(t("agentCapabilities.exported"));
  };

  const openConfigFile = async (targetPath: string, initialContents: string) => {
    setConfigEditorLoading(true);
    setConfigEditorPath(targetPath);
    try {
      setConfigEditorText(await ensureTextFile(targetPath, initialContents));
    } catch (candidate) {
      setConfigEditorPath(null);
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    } finally {
      setConfigEditorLoading(false);
    }
  };

  const saveConfigFile = async () => {
    if (!configEditorPath) return;
    try {
      const backupPath = await backupAndWriteTextFile(configEditorPath, configEditorText.endsWith("\n") ? configEditorText : `${configEditorText}\n`);
      setConfigEditorPath(null);
      await refresh();
      toast.success(backupPath ? t("agentCapabilities.config.savedWithBackup", { path: backupPath }) : t("agentCapabilities.config.saved"));
    } catch (candidate) {
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    }
  };

  const content = section === "skills"
    ? <AgentSkillStudio query={deferredQuery} />
    : section === "mcp"
      ? <AgentMcpStudio query={deferredQuery} />
      : section === "plugins"
        ? <AgentPluginStudio query={deferredQuery} />
        : section === "apps"
          ? <AgentAppStudio query={deferredQuery} />
          : section === "sync"
            ? <CapabilitySyncStudio path={path} query={deferredQuery} />
            : section === "market"
              ? <CapabilityMarketplace path={path} query={deferredQuery} />
              : <AgentHookStudio query={deferredQuery} />;

  return (
    <CapabilityStudioShell
      title={t("agentCapabilities.title")}
      subtitle={`${repoName(path)} · ${t("agentCapabilities.subtitle")}`}
      mark={(
        <AgentProviderMark working={loading} label={t("agentCapabilities.title")} className="shrink-0">
          <CodexLogo />
        </AgentProviderMark>
      )}
      query={query}
      onQueryChange={section === "sync" || section === "market" ? undefined : setQuery}
      searchPlaceholder={t("agentCapabilities.search")}
      onBack={onBack}
      backLabel={t("agentCapabilities.backToChat")}
      actions={(
        <>
          <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0 gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[12px]" onClick={() => setImportOpen(true)}>
            <Import className="size-3.5" />
            {t("agentCapabilities.import")}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0 gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[12px]" onClick={() => void exportSnapshot().catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))}>
            <Download className="size-3.5" />
            {t("agentCapabilities.export")}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0 gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[12px]" onClick={() => setConfigOpen(true)}>
            <SlidersHorizontal className="size-3.5" />
            {t("agentCapabilities.config.title")}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0 gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[12px]" disabled={loading} onClick={() => void refresh().catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))}>
            <SpinIcon icon={RefreshCw} active={loading} className="size-3.5" />
            {t("common.refresh")}
          </Button>
        </>
      )}
      tabs={SECTIONS.map(({ id, Icon }) => ({
        id,
        label: t(`agentCapabilities.sections.${id}`),
        icon: <Icon className="size-3.5" />,
        count: counts[id],
      }))}
      tabValue={section}
      onTabChange={(id) => {
        setSection(id as AgentCapabilitySection);
        setQuery("");
      }}
      tabsLabel={t("agentCapabilities.title")}
    >
      {loading && (!loadedAt || storePath !== path) ? <CapabilityLoading label={t("agentCapabilities.loading")} /> : (
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={section}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SPRING_PANEL}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <Suspense fallback={<CapabilityLoading label={t("agentCapabilities.loading")} />}>{content}</Suspense>
          </m.div>
        </AnimatePresence>
      )}

      {importOpen ? (
        <Suspense fallback={null}>
          <AgentImportDialog open={importOpen} onOpenChange={(open) => { setImportOpen(open); if (!open) void refresh(); }} path={path} />
        </Suspense>
      ) : null}

      <Dialog open={configOpen} onOpenChange={(open) => { setConfigOpen(open); if (!open) setConfigEditorPath(null); }}>
        <DialogContent className="max-h-[min(760px,calc(100vh-2rem))] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{configEditorPath ? t("agentCapabilities.config.rawEditor") : t("agentCapabilities.config.title")}</DialogTitle><DialogDescription>{configEditorPath || t("agentCapabilities.config.description")}</DialogDescription></DialogHeader>
          {configEditorPath ? (
            configEditorLoading ? <div className="flex min-h-80 items-center justify-center"><SpinIcon icon={LoaderCircle} className="size-4" /></div> : <Textarea value={configEditorText} onChange={(event) => setConfigEditorText(event.target.value)} spellCheck={false} className="min-h-[30rem] resize-y font-mono text-[11px] leading-5" />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {config?.userConfigPath ? <Button type="button" variant="ghost" onClick={() => void openConfigFile(config.userConfigPath ?? "", "# Personal Codex settings\n")} className="ag-card h-auto items-start justify-start p-4 text-left hover:bg-[var(--ag-hover)]"><span><FileCode2 className="size-4" /><p className="mt-3 text-xs font-medium">{t("agentCapabilities.config.user")}</p><p className="mt-1 line-clamp-2 break-all font-mono text-[9px] leading-4 text-muted-foreground">{config.userConfigPath}</p></span></Button> : null}
                {config?.projectConfigPath ? <Button type="button" variant="ghost" onClick={() => void openConfigFile(config.projectConfigPath, "# Repository-scoped Codex settings\n")} className="ag-card h-auto items-start justify-start p-4 text-left hover:bg-[var(--ag-hover)]"><span><FileCode2 className="size-4" /><p className="mt-3 text-xs font-medium">{t("agentCapabilities.config.project")}</p><p className="mt-1 line-clamp-2 break-all font-mono text-[9px] leading-4 text-muted-foreground">{config.projectConfigPath}</p></span></Button> : null}
              </div>
              <section>
                <p className="ag-label mb-2">{t("agentCapabilities.config.layers")}</p>
                <div className="space-y-1.5">
                  {(config?.layers ?? []).map((layer, index) => (
                    <div key={`${layer.name.type}:${layer.version}:${index}`} className="ag-card flex items-start gap-3 px-3 py-2.5">
                      <AgDot className="mt-1.5 shrink-0" state={layer.disabledReason ? "working" : "ready"} />
                      <div className="min-w-0 flex-1"><p className="text-[11px] font-medium">{layer.name.name || layer.name.type}</p><p className="mt-0.5 break-all font-mono text-[9px] leading-4 text-muted-foreground">{layer.name.file || layer.name.dotCodexFolder || layer.name.id || layer.version}</p>{layer.disabledReason ? <p className="mt-1 text-[9px] text-amber-600 dark:text-amber-400">{layer.disabledReason}</p> : null}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
          <DialogFooter>
            {configEditorPath ? <><Button type="button" variant="outline" onClick={() => setConfigEditorPath(null)}>{t("common.back")}</Button><Button type="button" disabled={configEditorLoading} onClick={() => void saveConfigFile()}><Save className="size-3.5" />{t("common.save")}</Button></> : <Button type="button" variant="outline" onClick={() => setConfigOpen(false)}>{t("common.close")}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CapabilityStudioShell>
  );
}
