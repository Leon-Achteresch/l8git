import {
  Braces,
  Copy,
  Database,
  ExternalLink,
  Globe2,
  KeyRound,
  LoaderCircle,
  Plus,
  Save,
  ServerCog,
  TerminalSquare,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { openUrl } from "@tauri-apps/plugin-opener";

import {
  CapabilityEmpty,
  CapabilityError,
  CapabilityListButton,
  CapabilityPill,
  ProgressiveCapabilityList,
  CapabilitySectionTitle,
  CapabilitySplit,
  CapabilityStat,
} from "@/components/agents/capabilities/capability-ui";
import { copyToClipboard } from "@/components/agents/ui/item-context-menu";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  emptyMcpServerDraft,
  mcpServerDraft,
  useAgentCapabilityStore,
} from "@/lib/agents/capability-store";
import type {
  AgentCapabilityMcpServer,
  AgentMcpServerDraft,
} from "@/lib/agents/capability-types";
import { SpinIcon } from "@/components/motion/kit";

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function lines(value: string): string[] {
  return value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean);
}

function pairs(value: string): Array<{ key: string; value: string }> {
  return value.split(/\r?\n/u).map((line) => {
    const index = line.indexOf("=");
    return index < 0
      ? { key: line.trim(), value: "" }
      : { key: line.slice(0, index).trim(), value: line.slice(index + 1) };
  }).filter((item) => item.key);
}

function pairLines(value: Array<{ key: string; value: string }>): string {
  return value.map((item) => `${item.key}=${item.value}`).join("\n");
}

function authTone(status: string): "neutral" | "good" | "warning" | "bad" {
  if (status === "oAuth" || status === "bearerToken") return "good";
  if (status === "notLoggedIn") return "warning";
  if (status === "unavailable") return "bad";
  return "neutral";
}

function serverEnabled(server: AgentCapabilityMcpServer): boolean {
  return server.config?.enabled !== false;
}

function toolPolicy(server: AgentCapabilityMcpServer, toolName: string): { enabled: boolean; mode: "auto" | "prompt" | "writes" | "approve" } {
  const tools = record(server.config?.tools);
  const tool = record(tools[toolName]);
  const mode = tool.approval_mode;
  const enabledTools = Array.isArray(server.config?.enabled_tools) ? server.config.enabled_tools.filter((item): item is string => typeof item === "string") : [];
  const disabledTools = Array.isArray(server.config?.disabled_tools) ? server.config.disabled_tools.filter((item): item is string => typeof item === "string") : [];
  return {
    enabled: !disabledTools.includes(toolName) && (!enabledTools.length || enabledTools.includes(toolName)),
    mode: mode === "prompt" || mode === "writes" || mode === "approve" ? mode : "auto",
  };
}

function McpEditor({
  draft,
  originalName,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  draft: AgentMcpServerDraft;
  originalName?: string;
  saving: boolean;
  onChange: (draft: AgentMcpServerDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="pb-8">
      <CapabilitySectionTitle
        eyebrow={originalName ? t("agentCapabilities.mcp.edit") : t("agentCapabilities.mcp.create")}
        title={draft.name || t("agentCapabilities.mcp.untitled")}
        description={t("agentCapabilities.mcp.editorDescription")}
        actions={(
          <>
            <Button type="button" variant="ghost" size="sm" className="rounded-lg" onClick={onCancel}>
              <X className="size-3.5" />
              {t("common.cancel")}
            </Button>
            <Button type="button" size="sm" className="rounded-lg" disabled={saving} onClick={onSave}>
              {saving ? <SpinIcon icon={LoaderCircle} className="size-3.5" /> : <Save className="size-3.5" />}
              {t("common.save")}
            </Button>
          </>
        )}
      />
      <div className="mx-auto max-w-4xl space-y-6 p-5">
        <section className="grid gap-4 ag-card p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mcp-name" className="text-[10px]">{t("agentCapabilities.mcp.name")}</Label>
            <Input id="mcp-name" value={draft.name} disabled={Boolean(originalName)} onChange={(event) => onChange({ ...draft, name: event.target.value.replace(/[^A-Za-z0-9_-]/gu, "-") })} placeholder="github" className="h-9 rounded-lg font-mono text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-transport" className="text-[10px]">{t("agentCapabilities.mcp.transport")}</Label>
            <NativeSelect
              id="mcp-transport"
              value={draft.transport}
              onChange={(event) => {
                const transport = event.target.value as "http" | "stdio";
                onChange({
                  ...draft,
                  transport,
                  experimentalEnvironment: transport === "http" ? "local" : draft.experimentalEnvironment,
                  remoteEnvVars: transport === "http" ? [] : draft.remoteEnvVars,
                });
              }}
              className="w-full"
            >
              <NativeSelectOption value="http">Streamable HTTP</NativeSelectOption>
              <NativeSelectOption value="stdio">STDIO</NativeSelectOption>
            </NativeSelect>
          </div>
          <label className="ag-card flex items-center justify-between px-3 py-2.5">
            <span>
              <span className="block text-[11px] font-medium">{t("agentCapabilities.enabled")}</span>
              <span className="mt-0.5 block text-[9px] text-muted-foreground">{t("agentCapabilities.mcp.enabledHint")}</span>
            </span>
            <Switch checked={draft.enabled} onCheckedChange={(checked) => onChange({ ...draft, enabled: checked })} />
          </label>
          <label className="ag-card flex items-center justify-between px-3 py-2.5">
            <span>
              <span className="block text-[11px] font-medium">{t("agentCapabilities.mcp.required")}</span>
              <span className="mt-0.5 block text-[9px] text-muted-foreground">{t("agentCapabilities.mcp.requiredHint")}</span>
            </span>
            <Switch checked={draft.required} onCheckedChange={(checked) => onChange({ ...draft, required: checked })} />
          </label>
        </section>

        {draft.transport === "http" ? (
          <section className="space-y-4">
            <div>
              <h3 className="flex items-center gap-2 text-xs font-semibold"><Globe2 className="size-3.5" />HTTP endpoint</h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{t("agentCapabilities.mcp.httpHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-url" className="text-[10px]">URL</Label>
              <Input id="mcp-url" value={draft.url} onChange={(event) => onChange({ ...draft, url: event.target.value })} placeholder="https://example.com/mcp" className="h-9 rounded-lg font-mono text-xs" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="mcp-auth-mode" className="text-[10px]">{t("agentCapabilities.mcp.authMode")}</Label>
                <NativeSelect id="mcp-auth-mode" value={draft.auth} onChange={(event) => onChange({ ...draft, auth: event.target.value as "oauth" | "chatgpt" })} className="w-full">
                  <NativeSelectOption value="oauth">OAuth</NativeSelectOption>
                  <NativeSelectOption value="chatgpt">ChatGPT</NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-oauth-resource" className="text-[10px]">OAuth resource (RFC 8707)</Label>
                <Input id="mcp-oauth-resource" value={draft.oauthResource} onChange={(event) => onChange({ ...draft, oauthResource: event.target.value })} placeholder="https://api.example.com" className="h-9 rounded-lg font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-token-env" className="text-[10px]">Bearer token env var</Label>
                <Input id="mcp-token-env" value={draft.bearerTokenEnvVar} onChange={(event) => onChange({ ...draft, bearerTokenEnvVar: event.target.value })} placeholder="GITHUB_TOKEN" className="h-9 rounded-lg font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-scopes" className="text-[10px]">OAuth scopes</Label>
                <Input id="mcp-scopes" value={draft.scopes.join(", ")} onChange={(event) => onChange({ ...draft, scopes: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="repo, read:user" className="h-9 rounded-lg font-mono text-xs" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="mcp-http-headers" className="text-[10px]">{t("agentCapabilities.mcp.staticHeaders")}</Label>
                <Textarea id="mcp-http-headers" value={pairLines(draft.httpHeaders)} onChange={(event) => onChange({ ...draft, httpHeaders: pairs(event.target.value) })} placeholder="X-Client=l8git" className="min-h-24 rounded-lg font-mono text-[10px] leading-5" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-env-headers" className="text-[10px]">{t("agentCapabilities.mcp.envHeaders")}</Label>
                <Textarea id="mcp-env-headers" value={pairLines(draft.envHttpHeaders)} onChange={(event) => onChange({ ...draft, envHttpHeaders: pairs(event.target.value) })} placeholder="X-Auth=AUTH_ENV" className="min-h-24 rounded-lg font-mono text-[10px] leading-5" />
              </div>
            </div>
          </section>
        ) : (
          <section className="space-y-4">
            <div>
              <h3 className="flex items-center gap-2 text-xs font-semibold"><TerminalSquare className="size-3.5" />STDIO process</h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{t("agentCapabilities.mcp.stdioHint")}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
              <div className="space-y-1.5">
                <Label htmlFor="mcp-command" className="text-[10px]">{t("agentCapabilities.mcp.command")}</Label>
                <Input id="mcp-command" value={draft.command} onChange={(event) => onChange({ ...draft, command: event.target.value })} placeholder="npx" className="h-9 rounded-lg font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-args" className="text-[10px]">{t("agentCapabilities.mcp.arguments")}</Label>
                <Input id="mcp-args" value={draft.args.join(" ")} onChange={(event) => onChange({ ...draft, args: event.target.value.split(/\s+/u).filter(Boolean) })} placeholder="--yes @scope/server" className="h-9 rounded-lg font-mono text-xs" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-cwd" className="text-[10px]">{t("agentCapabilities.mcp.workingDirectory")}</Label>
              <Input id="mcp-cwd" value={draft.cwd} onChange={(event) => onChange({ ...draft, cwd: event.target.value })} placeholder="/absolute/path" className="h-9 rounded-lg font-mono text-xs" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="mcp-env" className="text-[10px]">{t("agentCapabilities.mcp.environment")}</Label>
                <Textarea id="mcp-env" value={pairLines(draft.env)} onChange={(event) => onChange({ ...draft, env: pairs(event.target.value) })} placeholder="API_URL=https://example.com" className="min-h-24 rounded-lg font-mono text-[10px] leading-5" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-env-vars" className="text-[10px]">{t("agentCapabilities.mcp.forwardedVars")}</Label>
                <Textarea id="mcp-env-vars" value={draft.envVars.join("\n")} onChange={(event) => onChange({ ...draft, envVars: lines(event.target.value) })} placeholder="GITHUB_TOKEN" className="min-h-24 rounded-lg font-mono text-[10px] leading-5" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-remote-env-vars" className="text-[10px]">{t("agentCapabilities.mcp.remoteForwardedVars")}</Label>
              <Textarea id="mcp-remote-env-vars" value={draft.remoteEnvVars.join("\n")} disabled={draft.experimentalEnvironment !== "remote"} onChange={(event) => onChange({ ...draft, remoteEnvVars: lines(event.target.value) })} placeholder="REMOTE_TOKEN" className="min-h-20 rounded-lg font-mono text-[10px] leading-5" />
              <p className="text-[9px] leading-4 text-muted-foreground">{t("agentCapabilities.mcp.remoteForwardedVarsHint")}</p>
            </div>
          </section>
        )}

        <section className="grid gap-3 ag-card p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mcp-default-approval" className="text-[10px]">{t("agentCapabilities.mcp.defaultApproval")}</Label>
            <NativeSelect id="mcp-default-approval" value={draft.defaultApprovalMode} onChange={(event) => onChange({ ...draft, defaultApprovalMode: event.target.value as AgentMcpServerDraft["defaultApprovalMode"] })} className="w-full">
              <NativeSelectOption value="auto">Auto</NativeSelectOption>
              <NativeSelectOption value="prompt">Prompt</NativeSelectOption>
              <NativeSelectOption value="writes">Writes</NativeSelectOption>
              <NativeSelectOption value="approve">Approve</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-environment-placement" className="text-[10px]">{t("agentCapabilities.mcp.placement")}</Label>
            <NativeSelect
              id="mcp-environment-placement"
              value={draft.experimentalEnvironment}
              onChange={(event) => {
                const experimentalEnvironment = event.target.value as "local" | "remote";
                onChange({
                  ...draft,
                  experimentalEnvironment,
                  remoteEnvVars: experimentalEnvironment === "remote" ? draft.remoteEnvVars : [],
                });
              }}
              className="w-full"
            >
              <NativeSelectOption value="local">Local</NativeSelectOption>
              <NativeSelectOption value="remote" disabled={draft.transport === "http"}>Remote executor</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-startup-timeout" className="text-[10px]">{t("agentCapabilities.mcp.startupTimeout")}</Label>
            <Input id="mcp-startup-timeout" type="number" min={1} value={draft.startupTimeoutSec} onChange={(event) => onChange({ ...draft, startupTimeoutSec: Number(event.target.value) || 10 })} className="h-9 rounded-lg text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-tool-timeout" className="text-[10px]">{t("agentCapabilities.mcp.toolTimeout")}</Label>
            <Input id="mcp-tool-timeout" type="number" min={1} value={draft.toolTimeoutSec} onChange={(event) => onChange({ ...draft, toolTimeoutSec: Number(event.target.value) || 60 })} className="h-9 rounded-lg text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-enabled-tools" className="text-[10px]">{t("agentCapabilities.mcp.allowTools")}</Label>
            <Textarea id="mcp-enabled-tools" value={draft.enabledTools.join("\n")} onChange={(event) => onChange({ ...draft, enabledTools: lines(event.target.value) })} className="min-h-20 rounded-lg font-mono text-[10px]" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-disabled-tools" className="text-[10px]">{t("agentCapabilities.mcp.denyTools")}</Label>
            <Textarea id="mcp-disabled-tools" value={draft.disabledTools.join("\n")} onChange={(event) => onChange({ ...draft, disabledTools: lines(event.target.value) })} className="min-h-20 rounded-lg font-mono text-[10px]" />
          </div>
        </section>
      </div>
    </div>
  );
}

export function AgentMcpStudio({ query }: { query: string }) {
  const { t } = useTranslation();
  const servers = useAgentCapabilityStore((state) => state.mcpServers);
  const error = useAgentCapabilityStore((state) => state.errors.mcp);
  const busyKey = useAgentCapabilityStore((state) => state.busyKey);
  const saveMcpServer = useAgentCapabilityStore((state) => state.saveMcpServer);
  const setMcpServerEnabled = useAgentCapabilityStore((state) => state.setMcpServerEnabled);
  const setMcpToolPolicy = useAgentCapabilityStore((state) => state.setMcpToolPolicy);
  const deleteMcpServer = useAgentCapabilityStore((state) => state.deleteMcpServer);
  const loginMcpServer = useAgentCapabilityStore((state) => state.loginMcpServer);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentMcpServerDraft | null>(null);
  const [originalName, setOriginalName] = useState<string | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<AgentCapabilityMcpServer | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => servers.filter((server) => !normalizedQuery || [
    server.name,
    server.serverInfo?.title ?? "",
    server.serverInfo?.description ?? "",
    ...Object.keys(server.tools),
  ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))), [normalizedQuery, servers]);
  const selected = servers.find((server) => server.name === selectedName) ?? filtered[0] ?? null;

  useEffect(() => {
    if (!selectedName && filtered[0]) setSelectedName(filtered[0].name);
    if (selectedName && !servers.some((server) => server.name === selectedName)) {
      setSelectedName(filtered[0]?.name ?? null);
    }
  }, [filtered, selectedName, servers]);

  const save = async () => {
    if (!draft) return;
    try {
      await saveMcpServer(draft, originalName);
      setSelectedName(draft.name);
      setDraft(null);
      setOriginalName(undefined);
      toast.success(t("agentCapabilities.mcp.saved"));
    } catch (candidate) {
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    }
  };

  if (draft) {
    return (
      <McpEditor
        draft={draft}
        originalName={originalName}
        saving={Boolean(busyKey?.startsWith("mcp:"))}
        onChange={setDraft}
        onCancel={() => {
          setDraft(null);
          setOriginalName(undefined);
        }}
        onSave={() => void save()}
      />
    );
  }

  return (
    <>
      <CapabilitySplit
        list={(
          <div className="p-2.5">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[10px] text-muted-foreground">{t("agentCapabilities.itemCount", { count: filtered.length })}</p>
              <Button type="button" variant="ghost" size="icon-xs" className="rounded-md" onClick={() => setDraft(emptyMcpServerDraft())} title={t("agentCapabilities.mcp.create")}>
                <Plus className="size-3.5" />
              </Button>
            </div>
            {error ? <CapabilityError message={error} /> : null}
            <div className="space-y-0.5">
              <ProgressiveCapabilityList
                items={filtered}
                getKey={(server) => server.name}
                resetKey={`${query}:${filtered.length}`}
                moreLabel={(count) => t("agentCapabilities.showMore", { count })}
                renderItem={(server) => (
                <CapabilityListButton
                  selected={server.name === selected?.name}
                  icon={server.config?.url ? <Globe2 className="size-3.5" /> : <TerminalSquare className="size-3.5" />}
                  title={server.serverInfo?.title || server.name}
                  description={server.serverInfo?.description || (server.config?.url as string | undefined) || (server.config?.command as string | undefined)}
                  meta={<CapabilityPill tone={authTone(server.authStatus)}>{server.authStatus}</CapabilityPill>}
                  trailing={<span className={`mt-1 block size-1.5 rounded-full ${serverEnabled(server) && server.authStatus !== "unavailable" ? "bg-emerald-500" : "bg-muted-foreground/35"}`} />}
                  onClick={() => setSelectedName(server.name)}
                  menuEntries={[
                    {
                      label: "Server-ID kopieren",
                      icon: <Copy className="size-3.5" />,
                      onSelect: () => copyToClipboard(server.name, "Server-ID kopiert"),
                    },
                    {
                      label: "Konfiguration kopieren",
                      icon: <Braces className="size-3.5" />,
                      onSelect: () =>
                        copyToClipboard(
                          JSON.stringify(server.config ?? {}, null, 2),
                          "Konfiguration kopiert",
                        ),
                    },
                  ]}
                />
                )}
              />
            </div>
          </div>
        )}
        detail={selected ? (
          <div className="pb-8">
            <CapabilitySectionTitle
              eyebrow="Model Context Protocol"
              title={selected.serverInfo?.title || selected.name}
              description={selected.serverInfo?.description || t("agentCapabilities.mcp.noDescription")}
              actions={(
                <>
                  <Switch checked={serverEnabled(selected)} disabled={busyKey === `mcp:${selected.name}`} onCheckedChange={(checked) => void setMcpServerEnabled(selected.name, checked).catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))} />
                  {selected.authStatus === "notLoggedIn" ? (
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => void loginMcpServer(selected.name)
                        .then((url) => openUrl(url))
                        .catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))}
                    >
                      <KeyRound className="size-3.5" />
                      {t("agentCapabilities.connect")}
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => {
                    setOriginalName(selected.name);
                    setDraft(mcpServerDraft(selected));
                  }}>
                    <ServerCog className="size-3.5" />
                    {t("agentCapabilities.edit")}
                  </Button>
                </>
              )}
            />
            <div className="space-y-6 p-5">
              <div className="grid gap-3 sm:grid-cols-4">
                <CapabilityStat label={t("agentCapabilities.status")} value={serverEnabled(selected) ? t("agentCapabilities.active") : t("agentCapabilities.inactive")} />
                <CapabilityStat label={t("agentCapabilities.auth")} value={selected.authStatus} />
                <CapabilityStat label={t("agentCapabilities.tools")} value={Object.keys(selected.tools).length} />
                <CapabilityStat label={t("agentCapabilities.resources")} value={selected.resources.length + selected.resourceTemplates.length} />
              </div>

              {selected.serverInfo?.websiteUrl ? (
                <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs" onClick={() => void openUrl(selected.serverInfo?.websiteUrl ?? "")}>
                  {selected.serverInfo.websiteUrl}
                  <ExternalLink className="size-3" />
                </Button>
              ) : null}

              <section>
                <div className="mb-2 flex items-center gap-2">
                  <Wrench className="size-3.5 text-muted-foreground" />
                  <h3 className="text-xs font-semibold">{t("agentCapabilities.mcp.exposedTools")}</h3>
                </div>
                {Object.keys(selected.tools).length ? (
                  <div className="ag-card overflow-hidden">
                    {Object.entries(selected.tools).map(([name, tool], index) => {
                      const policy = toolPolicy(selected, name);
                      const toolBusy = busyKey === `mcp:${selected.name}:${name}`;
                      return (
                        <div key={name} className={`grid gap-3 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_8rem_2.5rem] ${index ? "border-t border-border/35" : ""}`}>
                          <div className="min-w-0">
                            <p className="truncate font-mono text-[11px] font-medium">{tool.title || name}</p>
                            <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{tool.description || name}</p>
                          </div>
                          <NativeSelect
                            size="sm"
                            value={policy.mode}
                            disabled={toolBusy}
                            onChange={(event) => void setMcpToolPolicy(selected.name, name, policy.enabled, event.target.value as typeof policy.mode).catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))}
                            className="w-full"
                          >
                            <NativeSelectOption value="auto">Auto</NativeSelectOption>
                            <NativeSelectOption value="prompt">Prompt</NativeSelectOption>
                            <NativeSelectOption value="writes">Writes</NativeSelectOption>
                            <NativeSelectOption value="approve">Approve</NativeSelectOption>
                          </NativeSelect>
                          <Switch size="sm" checked={policy.enabled} disabled={toolBusy} onCheckedChange={(checked) => void setMcpToolPolicy(selected.name, name, checked, policy.mode).catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))} />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="ag-faint rounded-[12px] border border-dashed border-[var(--ag-line-strong)] p-4 text-center text-[11px]">{t("agentCapabilities.mcp.noTools")}</p>
                )}
              </section>

              {(selected.resources.length || selected.resourceTemplates.length) ? (
                <section>
                  <div className="mb-2 flex items-center gap-2">
                    <Database className="size-3.5 text-muted-foreground" />
                    <h3 className="text-xs font-semibold">{t("agentCapabilities.resources")}</h3>
                  </div>
                  <div className="space-y-1.5">
                    {selected.resources.map((resource) => (
                      <div key={resource.uri} className="ag-card px-3 py-2.5">
                        <p className="text-[11px] font-medium">{resource.title || resource.name}</p>
                        <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">{resource.uri}</p>
                      </div>
                    ))}
                    {selected.resourceTemplates.map((resource) => (
                      <div key={resource.uriTemplate} className="ag-card px-3 py-2.5">
                        <div className="flex items-center gap-2"><p className="text-[11px] font-medium">{resource.title || resource.name}</p><CapabilityPill>template</CapabilityPill></div>
                        <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">{resource.uriTemplate}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="border-t border-border/40 pt-4">
                <Button type="button" variant="ghost" size="sm" className="rounded-lg text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(selected)}>
                  <Trash2 className="size-3.5" />
                  {t("agentCapabilities.mcp.remove")}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <CapabilityEmpty
            title={t("agentCapabilities.mcp.empty")}
            description={t("agentCapabilities.mcp.emptyHint")}
            action={<Button type="button" size="sm" className="rounded-lg" onClick={() => setDraft(emptyMcpServerDraft())}><Plus className="size-3.5" />{t("agentCapabilities.mcp.create")}</Button>}
          />
        )}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("agentCapabilities.mcp.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("agentCapabilities.mcp.deleteDescription", { name: deleteTarget?.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!deleteTarget) return;
                void deleteMcpServer(deleteTarget.name)
                  .then(() => toast.success(t("agentCapabilities.mcp.deleted")))
                  .catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))
                  .finally(() => setDeleteTarget(null));
              }}
            >
              <Trash2 className="size-3.5" />
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
