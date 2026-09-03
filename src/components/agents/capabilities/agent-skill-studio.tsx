import {
  AtSign,
  Braces,
  Copy,
  FileText,
  LoaderCircle,
  Plus,
  Save,
  Sparkles,
  Trash2,
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
  ProgressiveCapabilityList,
  CapabilitySectionTitle,
  CapabilitySplit,
  CapabilityStat,
} from "@/components/agents/capabilities/capability-ui";
import { copyToClipboard } from "@/components/agents/ui/item-context-menu";
import { insertIntoAgentComposer } from "@/lib/agents/composer-insert";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  emptySkillDraft,
  useAgentCapabilityStore,
} from "@/lib/agents/capability-store";
import type {
  AgentCapabilitySkill,
  AgentSkillDraft,
  AgentSkillToolDependency,
} from "@/lib/agents/capability-types";
import { SpinIcon } from "@/components/motion/kit";

function skillInitial(skill: AgentCapabilitySkill): string {
  return (skill.interface?.displayName || skill.name).slice(0, 1).toUpperCase();
}

function skillLabel(skill: AgentCapabilitySkill): string {
  return skill.interface?.displayName || skill.name;
}

function SkillPreview({ draft }: { draft: AgentSkillDraft }) {
  const color = /^#[0-9a-f]{6}$/iu.test(draft.brandColor) ? draft.brandColor : "#10A37F";
  return (
    <div className="overflow-hidden rounded-2xl bg-foreground/[0.035] ring-1 ring-border/45">
      <div className="h-1" style={{ backgroundColor: color }} />
      <div className="flex items-start gap-3 p-4">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold text-white shadow-sm"
          style={{ backgroundColor: color }}
        >
          {(draft.displayName || draft.name || "S").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">
            {draft.displayName || draft.name || "New skill"}
          </p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
            {draft.shortDescription || draft.description || "Describe when this workflow should run."}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <CapabilityPill tone={draft.allowImplicitInvocation ? "good" : "neutral"}>
              {draft.allowImplicitInvocation ? "Auto" : "Explicit"}
            </CapabilityPill>
            <CapabilityPill>{draft.scope === "repo" ? "Repository" : "Personal"}</CapabilityPill>
            {draft.dependencies.length ? (
              <CapabilityPill>{draft.dependencies.length} tools</CapabilityPill>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function SkillEditor({
  draft,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  draft: AgentSkillDraft;
  saving: boolean;
  onChange: (draft: AgentSkillDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const updateDependency = (index: number, patch: Partial<AgentSkillToolDependency>) => {
    onChange({
      ...draft,
      dependencies: draft.dependencies.map((dependency, candidateIndex) =>
        candidateIndex === index ? { ...dependency, ...patch } : dependency),
    });
  };

  return (
    <div className="pb-8">
      <CapabilitySectionTitle
        eyebrow={draft.originalPath ? t("agentCapabilities.skills.edit") : t("agentCapabilities.skills.create")}
        title={draft.displayName || draft.name || t("agentCapabilities.skills.untitled")}
        description={t("agentCapabilities.skills.editorDescription")}
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

      <div className="grid gap-8 p-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className="space-y-3">
            <div>
              <h3 className="text-xs font-semibold">{t("agentCapabilities.skills.identity")}</h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{t("agentCapabilities.skills.identityHint")}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="skill-name" className="text-[10px]">{t("agentCapabilities.skills.name")}</Label>
                <Input
                  id="skill-name"
                  value={draft.name}
                  disabled={Boolean(draft.originalPath)}
                  onChange={(event) => onChange({ ...draft, name: event.target.value.toLocaleLowerCase().replace(/[^a-z0-9-]/gu, "-") })}
                  placeholder="release-notes"
                  className="h-9 rounded-lg font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="skill-scope" className="text-[10px]">{t("agentCapabilities.scope")}</Label>
                <Select
                  value={draft.scope}
                  disabled={Boolean(draft.originalPath)}
                  onValueChange={(value) => onChange({ ...draft, scope: value as "repo" | "user" })}
                >
                  <SelectTrigger id="skill-scope" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="repo">{t("agentCapabilities.scopeRepo")}</SelectItem>
                    <SelectItem value="user">{t("agentCapabilities.scopeUser")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="skill-description" className="text-[10px]">{t("agentCapabilities.skills.triggerDescription")}</Label>
              <Textarea
                id="skill-description"
                value={draft.description}
                onChange={(event) => onChange({ ...draft, description: event.target.value })}
                placeholder={t("agentCapabilities.skills.triggerPlaceholder")}
                className="min-h-20 resize-y rounded-lg text-xs leading-5"
              />
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-xs font-semibold">{t("agentCapabilities.skills.instructions")}</h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{t("agentCapabilities.skills.instructionsHint")}</p>
            </div>
            <Textarea
              value={draft.instructions}
              onChange={(event) => onChange({ ...draft, instructions: event.target.value })}
              spellCheck={false}
              className="min-h-[22rem] resize-y rounded-xl bg-foreground/[0.025] font-mono text-[11px] leading-5"
            />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold">{t("agentCapabilities.skills.dependencies")}</h3>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{t("agentCapabilities.skills.dependenciesHint")}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={() => onChange({
                  ...draft,
                  dependencies: [...draft.dependencies, { type: "mcp", value: "", description: "" }],
                })}
              >
                <Plus className="size-3.5" />
                {t("common.add")}
              </Button>
            </div>
            {draft.dependencies.length ? (
              <div className="space-y-2">
                {draft.dependencies.map((dependency, index) => (
                  <div key={index} className="ag-card space-y-2 p-2.5">
                    <div className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)_2rem]">
                      <Select
                        value={dependency.type}
                        onValueChange={(value) => updateDependency(index, { type: value })}
                      >
                        <SelectTrigger size="sm" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mcp">MCP</SelectItem>
                          <SelectItem value="env_var">Env var</SelectItem>
                          <SelectItem value="tool">Tool</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={dependency.value}
                        onChange={(event) => updateDependency(index, { value: event.target.value })}
                        placeholder={dependency.type === "mcp" ? "server-name" : "GITHUB_TOKEN"}
                        className="h-7 rounded-md font-mono text-[10px]"
                      />
                      <Input
                        value={dependency.description ?? ""}
                        onChange={(event) => updateDependency(index, { description: event.target.value })}
                        placeholder={t("agentCapabilities.description")}
                        className="h-7 rounded-md text-[10px]"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="rounded-md text-muted-foreground hover:text-destructive"
                        onClick={() => onChange({
                          ...draft,
                          dependencies: draft.dependencies.filter((_, candidateIndex) => candidateIndex !== index),
                        })}
                        aria-label={t("common.remove")}
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                    {dependency.type === "mcp" ? (
                      <div className="grid gap-2 pl-0 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] sm:pl-[7.5rem]">
                        <Select value={dependency.transport ?? "streamable_http"} onValueChange={(value) => updateDependency(index, { transport: value })}>
                          <SelectTrigger size="sm" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="streamable_http">HTTP</SelectItem>
                            <SelectItem value="stdio">STDIO</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input value={dependency.url ?? ""} onChange={(event) => updateDependency(index, { url: event.target.value })} placeholder="https://example.com/mcp" className="h-7 rounded-md font-mono text-[10px]" />
                        <Input value={dependency.command ?? ""} onChange={(event) => updateDependency(index, { command: event.target.value })} placeholder="npx server" className="h-7 rounded-md font-mono text-[10px]" />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="ag-faint rounded-[12px] border border-dashed border-[var(--ag-line-strong)] px-3 py-4 text-center text-[11px]">
                {t("agentCapabilities.skills.noDependencies")}
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
          <SkillPreview draft={draft} />
          <div className="ag-card space-y-3 p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("agentCapabilities.skills.presentation")}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="skill-display-name" className="text-[10px]">{t("agentCapabilities.skills.displayName")}</Label>
              <Input id="skill-display-name" value={draft.displayName} onChange={(event) => onChange({ ...draft, displayName: event.target.value })} className="h-8 rounded-lg text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="skill-short-description" className="text-[10px]">{t("agentCapabilities.skills.shortDescription")}</Label>
              <Textarea id="skill-short-description" value={draft.shortDescription} onChange={(event) => onChange({ ...draft, shortDescription: event.target.value })} className="min-h-16 rounded-lg text-[11px]" />
            </div>
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="skill-brand" className="text-[10px]">{t("agentCapabilities.skills.color")}</Label>
                <Input id="skill-brand" type="color" value={/^#[0-9a-f]{6}$/iu.test(draft.brandColor) ? draft.brandColor : "#10A37F"} onChange={(event) => onChange({ ...draft, brandColor: event.target.value })} className="h-8 rounded-lg p-1" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="skill-default-prompt" className="text-[10px]">{t("agentCapabilities.skills.defaultPrompt")}</Label>
                <Input id="skill-default-prompt" value={draft.defaultPrompt} onChange={(event) => onChange({ ...draft, defaultPrompt: event.target.value })} className="h-8 rounded-lg text-[11px]" />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="skill-icon-small" className="text-[10px]">{t("agentCapabilities.skills.iconSmall")}</Label>
                <Input id="skill-icon-small" value={draft.iconSmall} onChange={(event) => onChange({ ...draft, iconSmall: event.target.value })} placeholder="./assets/icon.svg" className="h-8 rounded-lg font-mono text-[10px]" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="skill-icon-large" className="text-[10px]">{t("agentCapabilities.skills.iconLarge")}</Label>
                <Input id="skill-icon-large" value={draft.iconLarge} onChange={(event) => onChange({ ...draft, iconLarge: event.target.value })} placeholder="./assets/logo.png" className="h-8 rounded-lg font-mono text-[10px]" />
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 ag-card px-3 py-2.5">
              <span>
                <span className="block text-[11px] font-medium">{t("agentCapabilities.skills.implicit")}</span>
                <span className="mt-0.5 block text-[9px] leading-4 text-muted-foreground">{t("agentCapabilities.skills.implicitHint")}</span>
              </span>
              <Switch checked={draft.allowImplicitInvocation} onCheckedChange={(checked) => onChange({ ...draft, allowImplicitInvocation: checked })} />
            </label>
            <div className="ag-card px-3 py-2.5">
              <p className="text-[11px] font-medium">{t("agentCapabilities.skills.products")}</p>
              <p className="mt-0.5 text-[9px] leading-4 text-muted-foreground">{t("agentCapabilities.skills.productsHint")}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["CODEX", "CHAT"] as const).map((product) => (
                  <label key={product} className="flex items-center justify-between rounded-lg bg-foreground/[0.03] px-2 py-1.5 text-[10px] font-medium">
                    {product}
                    <Switch
                      size="sm"
                      checked={draft.products.includes(product)}
                      onCheckedChange={(checked) => onChange({
                        ...draft,
                        products: checked
                          ? [...new Set([...draft.products, product])]
                          : draft.products.filter((candidate) => candidate !== product),
                      })}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function AgentSkillStudio({ query }: { query: string }) {
  const { t } = useTranslation();
  const skills = useAgentCapabilityStore((state) => state.skills);
  const skillErrors = useAgentCapabilityStore((state) => state.skillErrors);
  const error = useAgentCapabilityStore((state) => state.errors.skills);
  const busyKey = useAgentCapabilityStore((state) => state.busyKey);
  const setSkillEnabled = useAgentCapabilityStore((state) => state.setSkillEnabled);
  const readSkillDraft = useAgentCapabilityStore((state) => state.readSkillDraft);
  const saveSkill = useAgentCapabilityStore((state) => state.saveSkill);
  const duplicateSkill = useAgentCapabilityStore((state) => state.duplicateSkill);
  const deleteSkill = useAgentCapabilityStore((state) => state.deleteSkill);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentSkillDraft | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgentCapabilitySkill | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<AgentCapabilitySkill | null>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => skills.filter((skill) => !normalizedQuery || [
    skill.name,
    skill.description,
    skill.interface?.displayName ?? "",
    skill.scope,
  ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))), [normalizedQuery, skills]);
  const selected = skills.find((skill) => skill.path === selectedPath) ?? filtered[0] ?? null;

  useEffect(() => {
    if (!selectedPath && filtered[0]) setSelectedPath(filtered[0].path);
    if (selectedPath && !skills.some((skill) => skill.path === selectedPath)) {
      setSelectedPath(filtered[0]?.path ?? null);
    }
  }, [filtered, selectedPath, skills]);

  const editSkill = async (skill: AgentCapabilitySkill) => {
    setLoadingDraft(true);
    try {
      setDraft(await readSkillDraft(skill));
    } catch (candidate) {
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    } finally {
      setLoadingDraft(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    try {
      const skill = await saveSkill(draft);
      setSelectedPath(skill.path);
      setDraft(null);
      toast.success(t("agentCapabilities.skills.saved"));
    } catch (candidate) {
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    }
  };

  if (draft) {
    return (
      <SkillEditor
        draft={draft}
        saving={Boolean(busyKey?.startsWith("skill:"))}
        onChange={setDraft}
        onCancel={() => setDraft(null)}
        onSave={() => void save()}
      />
    );
  }

  return (
    <>
      <CapabilitySplit
        list={(
          <div className="p-3.5">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[10px] font-medium text-muted-foreground">
                {t("agentCapabilities.itemCount", { count: filtered.length })}
              </p>
              <Button type="button" variant="ghost" size="icon-xs" className="rounded-md" onClick={() => setDraft(emptySkillDraft())} title={t("agentCapabilities.skills.create")}>
                <Plus className="size-3.5" />
              </Button>
            </div>
            {error ? <CapabilityError message={error} /> : null}
            {skillErrors.map((issue) => <CapabilityError key={`${issue.path}:${issue.message}`} message={`${issue.path}: ${issue.message}`} />)}
            <div className="space-y-0.5">
              <ProgressiveCapabilityList
                items={filtered}
                getKey={(skill) => skill.path}
                resetKey={`${query}:${filtered.length}`}
                moreLabel={(count) => t("agentCapabilities.showMore", { count })}
                renderItem={(skill) => (
                <CapabilityListButton
                  selected={skill.path === selected?.path}
                  icon={<span className="text-[11px] font-semibold" style={{ color: skill.interface?.brandColor }}>{skillInitial(skill)}</span>}
                  title={skillLabel(skill)}
                  description={skill.description}
                  meta={<CapabilityPill>{skill.scope}</CapabilityPill>}
                  trailing={<span className={`mt-1 block size-1.5 rounded-full ${skill.enabled ? "bg-emerald-500" : "bg-muted-foreground/35"}`} />}
                  onClick={() => setSelectedPath(skill.path)}
                  menuEntries={[
                    {
                      label: "Pfad kopieren",
                      icon: <Copy className="size-3.5" />,
                      onSelect: () => copyToClipboard(skill.path, "Pfad kopiert"),
                    },
                    {
                      label: "Im Chat verwenden",
                      icon: <AtSign className="size-3.5" />,
                      onSelect: () => insertIntoAgentComposer(`@${skill.name} `),
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
              eyebrow={`${selected.scope} skill`}
              title={skillLabel(selected)}
              description={selected.description}
              actions={(
                <>
                  <Switch
                    checked={selected.enabled}
                    disabled={busyKey === `skill:${selected.path}`}
                    onCheckedChange={(checked) => void setSkillEnabled(selected, checked).catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))}
                    aria-label={t("agentCapabilities.enabled")}
                  />
                  <Button type="button" variant="outline" size="sm" className="rounded-lg" disabled={loadingDraft} onClick={() => void editSkill(selected)}>
                    {loadingDraft ? <SpinIcon icon={LoaderCircle} className="size-3.5" /> : <FileText className="size-3.5" />}
                    {t("agentCapabilities.edit")}
                  </Button>
                </>
              )}
            />
            <div className="space-y-6 p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <CapabilityStat label={t("agentCapabilities.scope")} value={selected.scope} />
                <CapabilityStat label={t("agentCapabilities.status")} value={selected.enabled ? t("agentCapabilities.active") : t("agentCapabilities.inactive")} />
                <CapabilityStat label={t("agentCapabilities.skills.dependencies")} value={selected.dependencies?.tools.length ?? 0} />
              </div>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
                <div className="ag-card p-4">
                  <div className="flex items-center gap-2">
                    <Braces className="size-3.5 text-muted-foreground" />
                    <h3 className="text-xs font-semibold">{t("agentCapabilities.skills.activation")}</h3>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{selected.description}</p>
                  <p className="mt-4 break-all font-mono text-[9px] leading-4 text-muted-foreground/70">{selected.path}</p>
                </div>
                <div className="ag-card p-4">
                  <Sparkles className="size-4" style={{ color: selected.interface?.brandColor }} />
                  <p className="mt-3 text-xs font-medium">${selected.name}</p>
                  <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{selected.interface?.defaultPrompt || t("agentCapabilities.skills.noDefaultPrompt")}</p>
                </div>
              </section>

              {selected.dependencies?.tools.length ? (
                <section>
                  <h3 className="mb-2 text-xs font-semibold">{t("agentCapabilities.skills.dependencies")}</h3>
                  <div className="space-y-1.5">
                    {selected.dependencies.tools.map((dependency) => (
                      <div key={`${dependency.type}:${dependency.value}`} className="flex items-center gap-3 rounded-xl bg-foreground/[0.03] px-3 py-2 ring-1 ring-border/30">
                        <CapabilityPill>{dependency.type}</CapabilityPill>
                        <code className="min-w-0 flex-1 truncate text-[10px]">{dependency.value}</code>
                        <span className="text-[10px] text-muted-foreground">{dependency.description}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="flex flex-wrap gap-2 border-t border-border/40 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => {
                    setDuplicateTarget(selected);
                    setDuplicateName(`${selected.name}-copy`);
                  }}
                >
                  <Copy className="size-3.5" />
                  {t("agentCapabilities.duplicate")}
                </Button>
                {selected.scope !== "system" && selected.scope !== "admin" ? (
                  <Button type="button" variant="ghost" size="sm" className="rounded-lg text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(selected)}>
                    <Trash2 className="size-3.5" />
                    {t("common.delete")}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <CapabilityEmpty
            title={t("agentCapabilities.skills.empty")}
            description={t("agentCapabilities.skills.emptyHint")}
            action={<Button type="button" size="sm" className="rounded-lg" onClick={() => setDraft(emptySkillDraft())}><Plus className="size-3.5" />{t("agentCapabilities.skills.create")}</Button>}
          />
        )}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("agentCapabilities.skills.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("agentCapabilities.skills.deleteDescription", { name: deleteTarget?.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!deleteTarget) return;
                void deleteSkill(deleteTarget)
                  .then((backupPath) => toast.success(t("agentCapabilities.skills.deletedWithBackup", { path: backupPath })))
                  .catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))
                  .finally(() => setDeleteTarget(null));
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(duplicateTarget)} onOpenChange={(open) => !open && setDuplicateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("agentCapabilities.skills.duplicateTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("agentCapabilities.skills.duplicateDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={duplicateName} onChange={(event) => setDuplicateName(event.target.value.toLocaleLowerCase().replace(/[^a-z0-9-]/gu, "-"))} className="font-mono" />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!duplicateTarget) return;
                void duplicateSkill(duplicateTarget, duplicateName)
                  .then(() => toast.success(t("agentCapabilities.skills.duplicated")))
                  .catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))
                  .finally(() => setDuplicateTarget(null));
              }}
            >
              {t("agentCapabilities.duplicate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
