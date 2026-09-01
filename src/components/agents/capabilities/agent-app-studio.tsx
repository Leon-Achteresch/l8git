import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AppWindow,
  ExternalLink,
  Globe2,
  LockKeyhole,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAgentCapabilityStore } from "@/lib/agents/capability-store";
import type { AgentCapabilityApp } from "@/lib/agents/capability-types";

type ApprovalMode = "auto" | "prompt" | "writes" | "approve";

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function appConfig(config: Record<string, unknown> | undefined, appId: string): Record<string, unknown> {
  const apps = record(config?.apps);
  return {
    approvals_reviewer: config?.approvals_reviewer,
    ...record(apps._default),
    ...record(apps[appId]),
  };
}

function toolConfig(config: Record<string, unknown> | undefined, appId: string, toolName: string): Record<string, unknown> {
  return record(record(appConfig(config, appId).tools)[toolName]);
}

function approvalMode(value: unknown): ApprovalMode {
  return value === "prompt" || value === "writes" || value === "approve" ? value : "auto";
}

function appInitial(app: AgentCapabilityApp): string {
  return app.name.slice(0, 1).toLocaleUpperCase();
}

export function AgentAppStudio({ query }: { query: string }) {
  const { t } = useTranslation();
  const apps = useAgentCapabilityStore((state) => state.apps);
  const config = useAgentCapabilityStore((state) => state.config?.config);
  const error = useAgentCapabilityStore((state) => state.errors.apps);
  const busyKey = useAgentCapabilityStore((state) => state.busyKey);
  const setAppEnabled = useAgentCapabilityStore((state) => state.setAppEnabled);
  const updateAppPolicy = useAgentCapabilityStore((state) => state.updateAppPolicy);
  const updateAppToolPolicy = useAgentCapabilityStore((state) => state.updateAppToolPolicy);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => apps.filter((app) => !normalizedQuery || [
    app.name,
    app.id,
    app.description ?? "",
    app.branding?.developer ?? "",
    ...(app.metadata?.categories ?? []),
    ...app.tools.flatMap((tool) => [tool.name, tool.title ?? "", tool.description]),
  ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))), [apps, normalizedQuery]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = apps.find((app) => app.id === selectedId) ?? filtered[0] ?? null;
  const selectedConfig = selected ? appConfig(config, selected.id) : {};
  const destructive = selectedConfig.destructive_enabled === true;
  const openWorld = selectedConfig.open_world_enabled === true;
  const defaultToolsEnabled = selectedConfig.default_tools_enabled !== false;
  const defaultMode = approvalMode(selectedConfig.default_tools_approval_mode);
  const reviewer = selectedConfig.approvals_reviewer === "auto_review" ? "auto_review" : "user";

  useEffect(() => {
    if (!selectedId && filtered[0]) setSelectedId(filtered[0].id);
    if (selectedId && !apps.some((app) => app.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [apps, filtered, selectedId]);

  const savePolicy = async (key: "destructive_enabled" | "open_world_enabled" | "default_tools_approval_mode" | "default_tools_enabled" | "approvals_reviewer", value: boolean | string) => {
    if (!selected) return;
    try {
      await updateAppPolicy(selected.id, [{ key, value }]);
      toast.success(t("agentCapabilities.apps.policySaved"));
    } catch (candidate) {
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    }
  };

  return (
    <CapabilitySplit
      list={(
        <div className="p-2.5">
          <p className="mb-2 px-1 text-[10px] text-muted-foreground">{t("agentCapabilities.itemCount", { count: filtered.length })}</p>
          {error ? <CapabilityError message={error} /> : null}
          <div className="space-y-0.5">
            <ProgressiveCapabilityList
              items={filtered}
              getKey={(app) => app.id}
              resetKey={`${query}:${filtered.length}`}
              moreLabel={(count) => t("agentCapabilities.showMore", { count })}
              renderItem={(app) => (
              <CapabilityListButton
                selected={app.id === selected?.id}
                icon={app.logoUrl ? <img src={app.logoUrl} alt="" className="size-5 rounded-md object-cover" /> : <span className="text-[11px] font-semibold">{appInitial(app)}</span>}
                title={app.name}
                description={app.description}
                meta={app.distributionChannel ? <CapabilityPill>{app.distributionChannel}</CapabilityPill> : undefined}
                trailing={<span className={`mt-1 block size-1.5 rounded-full ${app.isEnabled && app.runtime?.callable ? "bg-emerald-500" : "bg-muted-foreground/35"}`} />}
                onClick={() => setSelectedId(app.id)}
              />
              )}
            />
          </div>
        </div>
      )}
      detail={selected ? (
        <div className="pb-8">
          <CapabilitySectionTitle
            eyebrow={selected.branding?.category || selected.distributionChannel || "Codex app"}
            title={selected.name}
            description={selected.description}
            actions={(
              <>
                <Switch checked={selected.isEnabled} disabled={busyKey === `app:${selected.id}`} onCheckedChange={(checked) => void setAppEnabled(selected, checked).catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))} aria-label={t("agentCapabilities.enabled")} />
                {!selected.isAccessible && selected.installUrl ? <Button type="button" size="sm" className="rounded-lg" onClick={() => void openUrl(selected.installUrl ?? "")}><ExternalLink className="size-3.5" />{t("agentCapabilities.apps.install")}</Button> : null}
              </>
            )}
          />
          <div className="space-y-6 p-5">
            <div className="grid gap-3 sm:grid-cols-4">
              <CapabilityStat label={t("agentCapabilities.status")} value={selected.isEnabled ? t("agentCapabilities.active") : t("agentCapabilities.inactive")} />
              <CapabilityStat label={t("agentCapabilities.apps.runtime")} value={selected.runtime?.runtimeName || "—"} />
              <CapabilityStat label={t("agentCapabilities.apps.callable")} value={selected.runtime?.callable ? t("common.yes") : t("common.no")} />
              <CapabilityStat label={t("agentCapabilities.tools")} value={selected.tools.length} />
            </div>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="ag-card p-4">
                <div className="flex items-center gap-2"><ShieldCheck className="size-3.5 text-muted-foreground" /><h3 className="text-xs font-semibold">{t("agentCapabilities.apps.permissions")}</h3></div>
                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{t("agentCapabilities.apps.permissionsHint")}</p>
                <div className="mt-4 space-y-2">
                  <label className="ag-card flex items-center justify-between gap-3 px-3 py-2.5">
                    <span><span className="block text-[11px] font-medium">{t("agentCapabilities.apps.destructive")}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">{t("agentCapabilities.apps.destructiveHint")}</span></span>
                    <Switch checked={destructive} disabled={busyKey === `app:${selected.id}:policy`} onCheckedChange={(checked) => void savePolicy("destructive_enabled", checked)} />
                  </label>
                  <label className="ag-card flex items-center justify-between gap-3 px-3 py-2.5">
                    <span><span className="block text-[11px] font-medium">{t("agentCapabilities.apps.openWorld")}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">{t("agentCapabilities.apps.openWorldHint")}</span></span>
                    <Switch checked={openWorld} disabled={busyKey === `app:${selected.id}:policy`} onCheckedChange={(checked) => void savePolicy("open_world_enabled", checked)} />
                  </label>
                  <label className="ag-card flex items-center justify-between gap-3 px-3 py-2.5">
                    <span><span className="block text-[11px] font-medium">{t("agentCapabilities.apps.defaultToolsEnabled")}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">{t("agentCapabilities.apps.defaultToolsEnabledHint")}</span></span>
                    <Switch checked={defaultToolsEnabled} disabled={busyKey === `app:${selected.id}:policy`} onCheckedChange={(checked) => void savePolicy("default_tools_enabled", checked)} />
                  </label>
                  <div className="ag-card flex items-center justify-between gap-3 px-3 py-2.5">
                    <span><span className="block text-[11px] font-medium">{t("agentCapabilities.apps.defaultApproval")}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">{t("agentCapabilities.apps.defaultApprovalHint")}</span></span>
                    <Select value={defaultMode} disabled={busyKey === `app:${selected.id}:policy`} onValueChange={(value) => void savePolicy("default_tools_approval_mode", value)}>
                      <SelectTrigger size="sm" className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="prompt">Prompt</SelectItem>
                        <SelectItem value="writes">Writes</SelectItem>
                        <SelectItem value="approve">Approve</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="ag-card flex items-center justify-between gap-3 px-3 py-2.5">
                    <span><span className="block text-[11px] font-medium">{t("agentCapabilities.apps.reviewer")}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">{t("agentCapabilities.apps.reviewerHint")}</span></span>
                    <Select value={reviewer} disabled={busyKey === `app:${selected.id}:policy`} onValueChange={(value) => void savePolicy("approvals_reviewer", value)}>
                      <SelectTrigger size="sm" className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">{t("agentCapabilities.apps.reviewerUser")}</SelectItem>
                        <SelectItem value="auto_review">{t("agentCapabilities.apps.reviewerAuto")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <aside className="ag-card p-4">
                <span className="grid size-9 place-items-center rounded-xl bg-background ring-1 ring-border/40">{selected.logoUrl ? <img src={selected.logoUrl} alt="" className="size-7 rounded-lg object-cover" /> : <AppWindow className="size-4" />}</span>
                <p className="mt-3 text-xs font-medium">{selected.branding?.developer || selected.metadata?.developer || t("agentCapabilities.apps.unknownDeveloper")}</p>
                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{selected.metadata?.version ? `v${selected.metadata.version}` : selected.id}</p>
                {selected.pluginDisplayNames.length ? <div className="mt-3 flex flex-wrap gap-1">{selected.pluginDisplayNames.map((name) => <CapabilityPill key={name}>{name}</CapabilityPill>)}</div> : null}
                {selected.branding?.website ? <Button type="button" variant="link" size="sm" className="mt-3 h-auto px-0 text-[10px]" onClick={() => void openUrl(selected.branding?.website ?? "")}><Globe2 className="size-3" />{t("agentCapabilities.openWebsite")}</Button> : null}
              </aside>
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2"><Wrench className="size-3.5 text-muted-foreground" /><h3 className="text-xs font-semibold">{t("agentCapabilities.apps.toolsAndPolicies")}</h3></div>
              {selected.tools.length ? (
                <div className="ag-card overflow-hidden">
                  {selected.tools.map((tool, index) => {
                    const policy = toolConfig(config, selected.id, tool.name);
                    const enabled = policy.enabled === undefined ? tool.isEnabled : policy.enabled !== false;
                    const mode = approvalMode(policy.approval_mode ?? defaultMode);
                    const toolBusy = busyKey === `app:${selected.id}:${tool.name}`;
                    return (
                      <div key={tool.name} className={`grid gap-3 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_8rem_2.5rem] ${index ? "border-t border-border/35" : ""}`}>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2"><p className="truncate font-mono text-[11px] font-medium">{tool.title || tool.name}</p>{tool.isReadOnly ? <CapabilityPill tone="good">Read only</CapabilityPill> : <CapabilityPill tone="warning">Writes</CapabilityPill>}</div>
                          <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{tool.disabledReason || tool.description}</p>
                        </div>
                        <Select value={mode} disabled={toolBusy} onValueChange={(value) => void updateAppToolPolicy(selected.id, tool.name, enabled, value as ApprovalMode).catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))}>
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
                        <Switch size="sm" checked={enabled} disabled={toolBusy} onCheckedChange={(checked) => void updateAppToolPolicy(selected.id, tool.name, checked, mode).catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border/55 p-6 text-[10px] text-muted-foreground"><LockKeyhole className="size-3.5" />{t("agentCapabilities.apps.noTools")}</div>
              )}
            </section>
          </div>
        </div>
      ) : (
        <CapabilityEmpty title={t("agentCapabilities.apps.empty")} description={t("agentCapabilities.apps.emptyHint")} />
      )}
    />
  );
}
