import {
  Braces,
  FileCode2,
  LoaderCircle,
  Plus,
  Save,
  ShieldAlert,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  X,
  Zap,
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAgentCapabilityStore } from "@/lib/agents/capability-store";
import type { AgentCapabilityHook } from "@/lib/agents/capability-types";

interface HookDraft {
  eventName: string;
  matcher: string;
  type: string;
  command: string;
  timeout: number;
  statusMessage: string;
  additionalContextLimit: number | null;
}

const EVENT_NAMES = [
  "SessionStart",
  "SessionEnd",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PreCompact",
  "PostCompact",
  "UserPromptSubmit",
  "SubagentStart",
  "SubagentStop",
  "Stop",
] as const;

function eventConfigName(eventName: string): string {
  const match = EVENT_NAMES.find((candidate) => candidate.toLocaleLowerCase() === eventName.toLocaleLowerCase());
  return match ?? `${eventName.slice(0, 1).toLocaleUpperCase()}${eventName.slice(1)}`;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function hookDraft(hook?: AgentCapabilityHook): HookDraft {
  return {
    eventName: eventConfigName(hook?.eventName ?? "PreToolUse"),
    matcher: hook?.matcher ?? "",
    type: hook?.handlerType ?? "command",
    command: hook?.command ?? "",
    timeout: hook?.timeoutSec ?? 600,
    statusMessage: hook?.statusMessage ?? "",
    additionalContextLimit: hook?.additionalContextLimit ?? null,
  };
}

function patchHookJson(contents: string, draft: HookDraft, original?: AgentCapabilityHook): string {
  const parsed = JSON.parse(contents) as Record<string, unknown>;
  const hooks = record(parsed.hooks);
  const handler = {
    type: draft.type,
    command: draft.command,
    timeout: draft.timeout,
    ...(draft.statusMessage.trim() ? { statusMessage: draft.statusMessage.trim() } : {}),
    ...(draft.additionalContextLimit ? { additionalContextLimit: draft.additionalContextLimit } : {}),
  };
  const group = {
    ...(draft.matcher.trim() ? { matcher: draft.matcher.trim() } : {}),
    hooks: [handler],
  };

  if (!original) {
    const eventEntries = Array.isArray(hooks[draft.eventName]) ? [...hooks[draft.eventName] as unknown[]] : [];
    eventEntries.push(group);
    hooks[draft.eventName] = eventEntries;
    parsed.hooks = hooks;
    return `${JSON.stringify(parsed, null, 2)}\n`;
  }

  const sourceEvent = eventConfigName(original.eventName);
  const sourceGroups = Array.isArray(hooks[sourceEvent]) ? [...hooks[sourceEvent] as unknown[]] : [];
  let found = false;
  for (let groupIndex = 0; groupIndex < sourceGroups.length; groupIndex += 1) {
    const candidateGroup = record(sourceGroups[groupIndex]);
    if ((candidateGroup.matcher ?? null) !== (original.matcher || null)) continue;
    const handlers = Array.isArray(candidateGroup.hooks) ? [...candidateGroup.hooks] : [];
    const handlerIndex = handlers.findIndex((candidate) => {
      const value = record(candidate);
      return value.type === original.handlerType && (value.command ?? null) === (original.command ?? null);
    });
    if (handlerIndex < 0) continue;
    handlers.splice(handlerIndex, 1);
    found = true;
    if (handlers.length) sourceGroups[groupIndex] = { ...candidateGroup, hooks: handlers };
    else sourceGroups.splice(groupIndex, 1);
    break;
  }
  if (!found) throw new Error("Der Hook konnte in der Quelldatei nicht eindeutig gefunden werden.");
  if (sourceGroups.length) hooks[sourceEvent] = sourceGroups;
  else delete hooks[sourceEvent];
  const targetGroups = Array.isArray(hooks[draft.eventName]) ? [...hooks[draft.eventName] as unknown[]] : [];
  targetGroups.push(group);
  hooks[draft.eventName] = targetGroups;
  parsed.hooks = hooks;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function removeHookJson(contents: string, original: AgentCapabilityHook): string {
  const parsed = JSON.parse(contents) as Record<string, unknown>;
  const hooks = record(parsed.hooks);
  const sourceEvent = eventConfigName(original.eventName);
  const sourceGroups = Array.isArray(hooks[sourceEvent]) ? [...hooks[sourceEvent] as unknown[]] : [];
  let found = false;
  for (let groupIndex = 0; groupIndex < sourceGroups.length; groupIndex += 1) {
    const candidateGroup = record(sourceGroups[groupIndex]);
    if ((candidateGroup.matcher ?? null) !== (original.matcher || null)) continue;
    const handlers = Array.isArray(candidateGroup.hooks) ? [...candidateGroup.hooks] : [];
    const handlerIndex = handlers.findIndex((candidate) => {
      const value = record(candidate);
      return value.type === original.handlerType && (value.command ?? null) === (original.command ?? null);
    });
    if (handlerIndex < 0) continue;
    handlers.splice(handlerIndex, 1);
    found = true;
    if (handlers.length) sourceGroups[groupIndex] = { ...candidateGroup, hooks: handlers };
    else sourceGroups.splice(groupIndex, 1);
    break;
  }
  if (!found) throw new Error("Der Hook konnte in der Quelldatei nicht eindeutig gefunden werden.");
  if (sourceGroups.length) hooks[sourceEvent] = sourceGroups;
  else delete hooks[sourceEvent];
  parsed.hooks = hooks;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function trustTone(status: string): "neutral" | "good" | "warning" | "bad" {
  if (status === "trusted" || status === "managed") return "good";
  if (status === "modified") return "warning";
  if (status === "untrusted") return "bad";
  return "neutral";
}

function hooksFeatureEnabled(config: Record<string, unknown> | undefined): boolean {
  return record(config?.features).hooks !== false;
}

export function AgentHookStudio({ query }: { query: string }) {
  const { t } = useTranslation();
  const hookEntry = useAgentCapabilityStore((state) => state.hooks);
  const config = useAgentCapabilityStore((state) => state.config?.config);
  const path = useAgentCapabilityStore((state) => state.path);
  const error = useAgentCapabilityStore((state) => state.errors.hooks);
  const busyKey = useAgentCapabilityStore((state) => state.busyKey);
  const readTextFile = useAgentCapabilityStore((state) => state.readTextFile);
  const backupAndWriteTextFile = useAgentCapabilityStore((state) => state.backupAndWriteTextFile);
  const createHookFile = useAgentCapabilityStore((state) => state.createHookFile);
  const setHooksEnabled = useAgentCapabilityStore((state) => state.setHooksEnabled);
  const refresh = useAgentCapabilityStore((state) => state.refresh);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => hookEntry.hooks.filter((hook) => !normalizedQuery || [
    hook.key,
    hook.eventName,
    hook.command ?? "",
    hook.matcher ?? "",
    hook.source,
    hook.sourcePath,
  ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))), [hookEntry.hooks, normalizedQuery]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgentCapabilityHook | null>(null);
  const [sourcePath, setSourcePath] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [draft, setDraft] = useState<HookDraft>(hookDraft());
  const [editingHook, setEditingHook] = useState<AgentCapabilityHook | undefined>();
  const [sourceLoading, setSourceLoading] = useState(false);
  const selected = hookEntry.hooks.find((hook) => hook.key === selectedKey) ?? filtered[0] ?? null;
  const globalEnabled = hooksFeatureEnabled(config);

  useEffect(() => {
    if (!selectedKey && filtered[0]) setSelectedKey(filtered[0].key);
    if (selectedKey && !hookEntry.hooks.some((hook) => hook.key === selectedKey)) {
      setSelectedKey(filtered[0]?.key ?? null);
    }
  }, [filtered, hookEntry.hooks, selectedKey]);

  const loadSource = async (targetPath: string) => {
    setSourceLoading(true);
    try {
      const contents = await readTextFile(targetPath);
      setSourcePath(targetPath);
      setSourceText(contents);
      return contents;
    } finally {
      setSourceLoading(false);
    }
  };

  const openRaw = async (hook: AgentCapabilityHook) => {
    try {
      await loadSource(hook.sourcePath);
      setRawOpen(true);
    } catch (candidate) {
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    }
  };

  const openStructured = async (hook?: AgentCapabilityHook) => {
    const targetPath = hook?.sourcePath ?? (path ? `${path.replace(/[\\/]+$/u, "")}/.codex/hooks.json` : "");
    if (hook?.isManaged) return;
    if (hook && !hook.sourcePath.toLocaleLowerCase().endsWith(".json")) {
      toast.info(t("agentCapabilities.hooks.jsonOnly"));
      await openRaw(hook);
      return;
    }
    try {
      let contents: string;
      if (hook) {
        contents = await loadSource(hook.sourcePath);
      } else {
        try {
          contents = await loadSource(targetPath);
        } catch {
          const createdPath = await createHookFile("repo");
          contents = await loadSource(createdPath);
        }
      }
      JSON.parse(contents);
      setEditingHook(hook);
      setDraft(hookDraft(hook));
      setEditorOpen(true);
    } catch (candidate) {
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    }
  };

  const createInScope = async (scope: "repo" | "user") => {
    try {
      setCreateOpen(false);
      const createdPath = await createHookFile(scope);
      const contents = await loadSource(createdPath);
      JSON.parse(contents);
      setEditingHook(undefined);
      setDraft(hookDraft());
      setEditorOpen(true);
    } catch (candidate) {
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    }
  };

  const saveStructured = async () => {
    if (!sourcePath || !draft.command.trim()) return;
    try {
      const next = patchHookJson(sourceText, draft, editingHook);
      await backupAndWriteTextFile(sourcePath, next);
      setEditorOpen(false);
      await refresh();
      toast.success(t("agentCapabilities.hooks.saved"));
    } catch (candidate) {
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    }
  };

  const saveRaw = async () => {
    try {
      if (sourcePath.toLocaleLowerCase().endsWith(".json")) JSON.parse(sourceText);
      await backupAndWriteTextFile(sourcePath, sourceText.endsWith("\n") ? sourceText : `${sourceText}\n`);
      setRawOpen(false);
      await refresh();
      toast.success(t("agentCapabilities.hooks.saved"));
    } catch (candidate) {
      toast.error(candidate instanceof Error ? candidate.message : String(candidate));
    }
  };

  const removeHook = async (hook: AgentCapabilityHook) => {
    if (hook.isManaged || !hook.sourcePath.toLocaleLowerCase().endsWith(".json")) {
      throw new Error(t("agentCapabilities.hooks.jsonOnly"));
    }
    const contents = await readTextFile(hook.sourcePath);
    await backupAndWriteTextFile(hook.sourcePath, removeHookJson(contents, hook));
    await refresh();
  };

  return (
    <>
      <CapabilitySplit
        list={(
          <div className="p-2.5">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[10px] text-muted-foreground">{t("agentCapabilities.itemCount", { count: filtered.length })}</p>
              <Button type="button" variant="ghost" size="icon-xs" className="rounded-md" onClick={() => setCreateOpen(true)} title={t("agentCapabilities.hooks.create")}><Plus className="size-3.5" /></Button>
            </div>
            {error ? <CapabilityError message={error} /> : null}
            {hookEntry.warnings.map((warning) => <CapabilityError key={warning} message={warning} />)}
            {hookEntry.errors.map((issue) => <CapabilityError key={`${issue.path}:${issue.message}`} message={`${issue.path}: ${issue.message}`} />)}
            <div className="space-y-0.5">
              <ProgressiveCapabilityList
                items={filtered}
                getKey={(hook) => hook.key}
                resetKey={`${query}:${filtered.length}`}
                moreLabel={(count) => t("agentCapabilities.showMore", { count })}
                renderItem={(hook) => (
                <CapabilityListButton
                  selected={hook.key === selected?.key}
                  icon={<Zap className="size-3.5" />}
                  title={eventConfigName(hook.eventName)}
                  description={hook.command || hook.statusMessage || hook.sourcePath}
                  meta={<CapabilityPill tone={trustTone(hook.trustStatus)}>{hook.trustStatus}</CapabilityPill>}
                  trailing={<span className={`mt-1 block size-1.5 rounded-full ${globalEnabled && hook.enabled ? "bg-emerald-500" : "bg-muted-foreground/35"}`} />}
                  onClick={() => setSelectedKey(hook.key)}
                />
                )}
              />
            </div>
          </div>
        )}
        detail={selected ? (
          <div className="pb-8">
            <CapabilitySectionTitle
              eyebrow={`${selected.source} · ${selected.handlerType}`}
              title={eventConfigName(selected.eventName)}
              description={selected.statusMessage || selected.command}
              actions={(
                <>
                  <Switch checked={globalEnabled} disabled={busyKey === "hooks:feature"} onCheckedChange={(checked) => void setHooksEnabled(checked).catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate)))} aria-label={t("agentCapabilities.hooks.globalEnabled")} />
                  {!selected.isManaged ? <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => void openStructured(selected)}><Braces className="size-3.5" />{t("agentCapabilities.edit")}</Button> : null}
                  {!selected.isManaged ? <Button type="button" variant="ghost" size="sm" className="rounded-lg" onClick={() => void openRaw(selected)}><FileCode2 className="size-3.5" />{t("agentCapabilities.hooks.source")}</Button> : null}
                  {!selected.isManaged && selected.sourcePath.toLocaleLowerCase().endsWith(".json") ? <Button type="button" variant="ghost" size="icon-sm" className="rounded-lg text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(selected)} title={t("common.delete")}><Trash2 className="size-3.5" /></Button> : null}
                </>
              )}
            />
            <div className="space-y-6 p-5">
              <div className="grid gap-3 sm:grid-cols-4">
                <CapabilityStat label={t("agentCapabilities.status")} value={globalEnabled && selected.enabled ? t("agentCapabilities.active") : t("agentCapabilities.inactive")} />
                <CapabilityStat label={t("agentCapabilities.hooks.trust")} value={selected.trustStatus} />
                <CapabilityStat label={t("agentCapabilities.hooks.timeout")} value={`${selected.timeoutSec}s`} />
                <CapabilityStat label={t("agentCapabilities.hooks.order")} value={selected.displayOrder} />
              </div>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="ag-card p-4">
                  <div className="flex items-center gap-2"><TerminalSquare className="size-3.5 text-muted-foreground" /><h3 className="text-xs font-semibold">{t("agentCapabilities.hooks.handler")}</h3></div>
                  <code className="mt-3 block whitespace-pre-wrap break-words rounded-xl bg-background/70 p-3 text-[10px] leading-5 ring-1 ring-border/35">{selected.command || selected.handlerType}</code>
                  <dl className="mt-4 grid gap-3 text-[10px] sm:grid-cols-2">
                    <div><dt className="text-muted-foreground">Matcher</dt><dd className="mt-1 font-mono">{selected.matcher || "*"}</dd></div>
                    <div><dt className="text-muted-foreground">Context limit</dt><dd className="mt-1 font-mono">{selected.additionalContextLimit ?? "default"}</dd></div>
                  </dl>
                </div>
                <div className={`rounded-2xl p-4 ring-1 ${selected.trustStatus === "trusted" || selected.trustStatus === "managed" ? "bg-emerald-500/[0.05] ring-emerald-500/20" : "bg-amber-500/[0.06] ring-amber-500/25"}`}>
                  {selected.trustStatus === "trusted" || selected.trustStatus === "managed" ? <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" /> : <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" />}
                  <p className="mt-3 text-xs font-medium">{t(`agentCapabilities.hooks.trust_${selected.trustStatus}`, { defaultValue: selected.trustStatus })}</p>
                  <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{selected.isManaged ? t("agentCapabilities.hooks.managedHint") : t("agentCapabilities.hooks.trustHint")}</p>
                </div>
              </section>

              <section className="ag-card p-4">
                <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t("agentCapabilities.hooks.sourcePath")}</p>
                <p className="mt-2 break-all font-mono text-[10px] leading-5">{selected.sourcePath}</p>
                <p className="mt-2 break-all font-mono text-[9px] text-muted-foreground">SHA {selected.currentHash}</p>
              </section>
            </div>
          </div>
        ) : (
          <CapabilityEmpty title={t("agentCapabilities.hooks.empty")} description={t("agentCapabilities.hooks.emptyHint")} action={<Button type="button" size="sm" className="rounded-lg" onClick={() => setCreateOpen(true)}><Plus className="size-3.5" />{t("agentCapabilities.hooks.create")}</Button>} />
        )}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("agentCapabilities.hooks.create")}</DialogTitle><DialogDescription>{t("agentCapabilities.hooks.createScopeHint")}</DialogDescription></DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => void createInScope("repo")} className="rounded-xl bg-foreground/[0.035] p-4 text-left ring-1 ring-border/40 transition-colors hover:bg-foreground/[0.06]"><FileCode2 className="size-4" /><p className="mt-3 text-xs font-medium">{t("agentCapabilities.scopeRepo")}</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">.codex/hooks.json</p></button>
            <button type="button" onClick={() => void createInScope("user")} className="rounded-xl bg-foreground/[0.035] p-4 text-left ring-1 ring-border/40 transition-colors hover:bg-foreground/[0.06]"><ShieldCheck className="size-4" /><p className="mt-3 text-xs font-medium">{t("agentCapabilities.scopeUser")}</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">~/.codex/hooks.json</p></button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editingHook ? t("agentCapabilities.hooks.edit") : t("agentCapabilities.hooks.create")}</DialogTitle><DialogDescription>{sourcePath}</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="hook-event">Event</Label><NativeSelect id="hook-event" value={draft.eventName} onChange={(event) => setDraft({ ...draft, eventName: event.target.value })} className="w-full">{EVENT_NAMES.map((eventName) => <NativeSelectOption key={eventName} value={eventName}>{eventName}</NativeSelectOption>)}</NativeSelect></div>
            <div className="space-y-1.5"><Label htmlFor="hook-matcher">Matcher</Label><Input id="hook-matcher" value={draft.matcher} onChange={(event) => setDraft({ ...draft, matcher: event.target.value })} placeholder="Bash|apply_patch" className="font-mono text-xs" /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="hook-command">{t("agentCapabilities.hooks.command")}</Label><Textarea id="hook-command" value={draft.command} onChange={(event) => setDraft({ ...draft, command: event.target.value })} className="min-h-24 font-mono text-[11px] leading-5" /></div>
            <div className="space-y-1.5"><Label htmlFor="hook-timeout">{t("agentCapabilities.hooks.timeout")}</Label><Input id="hook-timeout" type="number" min={1} value={draft.timeout} onChange={(event) => setDraft({ ...draft, timeout: Number(event.target.value) || 1 })} /></div>
            <div className="space-y-1.5"><Label htmlFor="hook-context">Context limit</Label><Input id="hook-context" type="number" min={0} value={draft.additionalContextLimit ?? ""} onChange={(event) => setDraft({ ...draft, additionalContextLimit: event.target.value ? Number(event.target.value) : null })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="hook-status">Status message</Label><Input id="hook-status" value={draft.statusMessage} onChange={(event) => setDraft({ ...draft, statusMessage: event.target.value })} /></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setEditorOpen(false)}><X className="size-3.5" />{t("common.cancel")}</Button><Button type="button" disabled={sourceLoading || !draft.command.trim() || Boolean(busyKey?.startsWith("file:"))} onClick={() => void saveStructured()}>{busyKey?.startsWith("file:") ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}{t("common.save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rawOpen} onOpenChange={setRawOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader><DialogTitle>{t("agentCapabilities.hooks.source")}</DialogTitle><DialogDescription>{sourcePath}</DialogDescription></DialogHeader>
          {sourceLoading ? <div className="flex min-h-80 items-center justify-center"><LoaderCircle className="size-4 animate-spin" /></div> : <Textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} spellCheck={false} className="min-h-[28rem] resize-y font-mono text-[11px] leading-5" />}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setRawOpen(false)}>{t("common.cancel")}</Button><Button type="button" disabled={sourceLoading || Boolean(busyKey?.startsWith("file:"))} onClick={() => void saveRaw()}><Save className="size-3.5" />{t("common.save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t("agentCapabilities.hooks.deleteTitle")}</AlertDialogTitle><AlertDialogDescription>{t("agentCapabilities.hooks.deleteDescription", { event: deleteTarget ? eventConfigName(deleteTarget.eventName) : "" })}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { if (!deleteTarget) return; void removeHook(deleteTarget).then(() => toast.success(t("agentCapabilities.hooks.deleted"))).catch((candidate) => toast.error(candidate instanceof Error ? candidate.message : String(candidate))).finally(() => setDeleteTarget(null)); }}><Trash2 className="size-3.5" />{t("common.delete")}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
