import {
  Barcode,
  Blocks,
  Copy,
  Globe,
  LoaderCircle,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityPill } from "@/components/agents/capabilities/capability-ui";
import { CapabilityStudioShell } from "@/components/agents/capabilities/capability-studio-shell";
import { AgentBarcode } from "@/components/agents/ui/agent-barcode";
import { copyToClipboard } from "@/components/agents/ui/item-context-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import {
  BARCODE_FORMAT_DOC,
  BARCODE_FORMATS,
  barcodeFormat,
  parseBarcodeSpec,
  type AgentBarcodeKind,
} from "@/lib/agents/barcode-spec";
import {
  BROWSER_ADDON_BROWSERS,
  BROWSER_ADDON_SERVER_NAME,
  browserE2ePrompt,
  DEFAULT_BROWSER_ADDON_OPTIONS,
  installBrowserAddon,
  readBrowserAddon,
  removeBrowserAddon,
  type BrowserAddonBrowser,
  type BrowserAddonOptions,
  type BrowserAddonStatus,
} from "@/lib/agents/browser-addon";
import { insertIntoAgentComposer } from "@/lib/agents/composer-insert";
import { AGENT_PROVIDERS, agentProviderMeta } from "@/lib/agents/provider-meta";
import { useAgentProviderStore, type NativeAgentProvider } from "@/lib/agents/provider-store";
import { SpinIcon } from "@/components/motion/kit";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { SPRING_PANEL } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

function repoName(path: string): string {
  return path.split(/[\\/]/u).pop() ?? path;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function AddonCard({
  icon,
  title,
  description,
  status,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  status?: React.ReactNode;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();

  return (
    <m.section
      className="flex min-h-35 min-w-0 flex-col gap-3 rounded-[var(--ag-r-lg)] border border-[var(--ag-line)] bg-[var(--ag-surface)] px-5 py-[1.15rem] shadow-[var(--ag-shadow-raise)] transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-px hover:border-[var(--ag-line-strong)] hover:shadow-[var(--ag-shadow-panel)]"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_PANEL}
    >
      <header className="flex items-start gap-3">
        <span className="rounded-[var(--ag-r-md)] bg-[var(--ag-surface-2)] grid size-8 shrink-0 place-items-center rounded-[10px]">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-[13px] font-semibold tracking-tight">{title}</h3>
            {status}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </header>
      <div className="mt-2 min-w-0">{children}</div>
    </m.section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="block text-[11px] font-medium">{label}</span>
      {children}
      {hint ? <span className="text-[var(--ag-text-3)] block text-[10px] leading-4">{hint}</span> : null}
    </label>
  );
}

const KIND_ORDER: AgentBarcodeKind[] = ["linear", "matrix", "postal"];

function BarcodeAddonCard() {
  const { t } = useTranslation();
  const [format, setFormat] = useState("code128");
  const [value, setValue] = useState(() => barcodeFormat("code128")?.sample ?? "");
  const [label, setLabel] = useState("");

  const selected = barcodeFormat(format);
  const block = useMemo(
    () => JSON.stringify(
      { format, value, ...(label.trim() ? { label: label.trim() } : {}) },
      null,
      2,
    ),
    [format, label, value],
  );
  const spec = useMemo(() => parseBarcodeSpec(block), [block]);

  const pickFormat = (next: string) => {
    setFormat(next);
    const sample = barcodeFormat(next)?.sample;
    if (sample) setValue(sample);
  };

  return (
    <AddonCard
      icon={<Barcode className="size-4" />}
      title={t("agentAddons.barcode.title")}
      description={t("agentAddons.barcode.description")}
      status={<CapabilityPill tone="good">{t("agentAddons.alwaysOn")}</CapabilityPill>}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,21rem)]">
        <div className="min-w-0 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("agentAddons.barcode.format")} hint={selected?.hint}>
              <Select value={format} onValueChange={pickFormat}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_ORDER.map((kind) => (
                    <SelectGroup key={kind}>
                      <SelectLabel>{t(`agentAddons.barcode.kinds.${kind}`)}</SelectLabel>
                      {BARCODE_FORMATS.filter((entry) => entry.kind === kind).map((entry) => (
                        <SelectItem key={entry.id} value={entry.id}>
                          {entry.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("agentAddons.barcode.label")}>
              <Input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={t("agentAddons.barcode.labelPlaceholder")}
                className="h-8 text-[12px]"
              />
            </Field>
          </div>
          <Field label={t("agentAddons.barcode.value")}>
            <Textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              rows={2}
              className="font-mono text-[11px]"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-[11px]"
              onClick={() => {
                insertIntoAgentComposer(`\`\`\`barcode\n${block}\n\`\`\``);
                toast.success(t("agentAddons.barcode.inserted"));
              }}
            >
              {t("agentAddons.barcode.insert")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-[11px]"
              onClick={() => copyToClipboard(BARCODE_FORMAT_DOC, t("agentAddons.barcode.docCopied"))}
            >
              <Copy className="size-3" />
              {t("agentAddons.barcode.copyDoc")}
            </Button>
          </div>
          <p className="text-[var(--ag-text-3)] text-[10px] leading-4">
            {t("agentAddons.barcode.usage", { count: BARCODE_FORMATS.length })}
          </p>
        </div>
        <div className="min-w-0">
          {spec ? (
            <AgentBarcode spec={spec} />
          ) : (
            <p className="mt-3 rounded-xl border border-border/45 px-3 py-6 text-center text-[11px] text-muted-foreground">
              {t("agentAddons.barcode.noPreview")}
            </p>
          )}
        </div>
      </div>
    </AddonCard>
  );
}

function BrowserAddonCard({ path, onBack }: { path: string; onBack: () => void }) {
  const { t } = useTranslation();
  const activeProvider = useAgentProviderStore((state) => state.provider);
  const sendMessage = useAgentChatStore((state) => state.sendMessage);
  const [provider, setProvider] = useState<NativeAgentProvider>(activeProvider);
  const [status, setStatus] = useState<BrowserAddonStatus | null>(null);
  const [options, setOptions] = useState<BrowserAddonOptions>(DEFAULT_BROWSER_ADDON_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [scenario, setScenario] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await readBrowserAddon(path, provider);
      setStatus(next);
      if (next.installed) setOptions((current) => ({ ...next.options, baseUrl: current.baseUrl }));
    } finally {
      setLoading(false);
    }
  }, [path, provider]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const update = <K extends keyof BrowserAddonOptions>(key: K, next: BrowserAddonOptions[K]) => {
    setOptions((current) => ({ ...current, [key]: next }));
  };

  const run = async (action: () => Promise<BrowserAddonStatus>) => {
    setBusy(true);
    try {
      setStatus(await action());
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const install = () => run(async () => {
    const next = await installBrowserAddon(path, provider, options);
    toast.success(t("agentAddons.browser.installed", { provider: agentProviderMeta(provider).label }));
    return next;
  });

  const remove = () => run(async () => {
    const next = await removeBrowserAddon(path, provider);
    toast.success(t("agentAddons.browser.removed", { provider: agentProviderMeta(provider).label }));
    return next;
  });

  const startTest = async () => {
    if (!scenario.trim()) {
      toast.error(t("agentAddons.browser.scenarioMissing"));
      return;
    }
    if (provider !== activeProvider) {
      toast.error(t("agentAddons.browser.wrongProvider", { provider: agentProviderMeta(provider).label }));
      return;
    }
    try {
      await sendMessage(path, browserE2ePrompt(scenario, options));
      setScenario("");
      onBack();
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const installed = status?.installed === true;

  return (
    <AddonCard
      icon={<Globe className="size-4" />}
      title={t("agentAddons.browser.title")}
      description={t("agentAddons.browser.description")}
      status={
        loading ? (
          <CapabilityPill>{t("common.loading")}</CapabilityPill>
        ) : installed ? (
          <CapabilityPill tone="good">{t("agentAddons.browser.active")}</CapabilityPill>
        ) : (
          <CapabilityPill tone="warning">{t("agentAddons.browser.inactive")}</CapabilityPill>
        )
      }
    >
      <div className="space-y-5">
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto rounded-[var(--ag-r-md)] bg-[var(--ag-surface-2)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {AGENT_PROVIDERS.map((entry) => (
            <Button
              key={entry.value}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={provider === entry.value}
              onClick={() => setProvider(entry.value)}
              className={cn(
                "inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--ag-line)] bg-[var(--ag-surface)] px-2.5 text-[11px] font-medium text-[var(--ag-text-2)] outline-none transition-[background-color,border-color,color,transform] duration-200 hover:border-[var(--ag-line-strong)] hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring h-8 shrink-0 gap-1.5 border-0 bg-transparent px-2.5 text-[11px] font-medium shadow-none",
                provider === entry.value && "bg-[var(--ag-surface)] text-[var(--ag-text)] shadow-[var(--ag-shadow-raise)]",
              )}
            >
              <entry.Logo className="size-3.5" />
              {entry.label}
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="grid size-7 place-items-center rounded-full text-[var(--ag-text-2)] outline-none transition-[background-color,color,transform] duration-200 hover:-translate-y-px hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-95 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 ml-auto rounded-full"
            disabled={loading}
            onClick={() => void refresh()}
            title={t("common.refresh")}
            aria-label={t("common.refresh")}
          >
            <SpinIcon icon={RefreshCw} active={loading} className="size-4" />
          </Button>
        </div>

        {status?.error ? (
          <p className="rounded-xl border border-destructive/25 bg-destructive/[0.06] px-3 py-2 text-[11px] text-destructive">
            {status.error}
          </p>
        ) : null}

        <section className="">
          <div className="mb-3">
            <p className="text-[12px] font-semibold text-[var(--ag-text)]">{t("agentAddons.browser.browser")}</p>
            <p className="text-[var(--ag-text-3)] mt-0.5 text-[10px] leading-4">{t("agentAddons.browser.approvalHint")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label={t("agentAddons.browser.browser")}>
            <Select
              value={options.browser || "__default__"}
              onValueChange={(value) => update("browser", (value === "__default__" ? "" : value) as BrowserAddonBrowser)}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BROWSER_ADDON_BROWSERS.map((entry) => (
                  <SelectItem key={entry.value || "default"} value={entry.value || "__default__"}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("agentAddons.browser.viewport")} hint={t("agentAddons.browser.viewportHint")}>
            <Input
              value={options.viewport}
              onChange={(event) => update("viewport", event.target.value)}
              placeholder="1280x720"
              className="h-8 text-[12px]"
            />
          </Field>
          <Field label={t("agentAddons.browser.device")} hint={t("agentAddons.browser.deviceHint")}>
            <Input
              value={options.device}
              onChange={(event) => update("device", event.target.value)}
              placeholder="iPhone 15"
              className="h-8 text-[12px]"
            />
          </Field>
          <Field label={t("agentAddons.browser.allowedOrigins")} hint={t("agentAddons.browser.allowedOriginsHint")}>
            <Input
              value={options.allowedOrigins}
              onChange={(event) => update("allowedOrigins", event.target.value)}
              placeholder="http://localhost:5173"
              className="h-8 text-[12px]"
            />
          </Field>
          <Field label={t("agentAddons.browser.caps")} hint={t("agentAddons.browser.capsHint")}>
            <Input
              value={options.caps}
              onChange={(event) => update("caps", event.target.value)}
              placeholder="vision,pdf"
              className="h-8 text-[12px]"
            />
          </Field>
          <Field label={t("agentAddons.browser.baseUrl")} hint={t("agentAddons.browser.baseUrlHint")}>
            <Input
              value={options.baseUrl}
              onChange={(event) => update("baseUrl", event.target.value)}
              placeholder="http://localhost:5173"
              className="h-8 text-[12px]"
            />
          </Field>
          </div>
        </section>

        <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-[var(--ag-r-md)] border border-[var(--ag-line)] px-3 py-2.5">
          <label className="flex items-center gap-2 text-[11px]">
            <Switch
              size="sm"
              checked={options.headless}
              onCheckedChange={(next) => update("headless", next)}
            />
            {t("agentAddons.browser.headless")}
          </label>
          <label className="flex items-center gap-2 text-[11px]">
            <Switch
              size="sm"
              checked={options.isolated}
              onCheckedChange={(next) => update("isolated", next)}
            />
            {t("agentAddons.browser.isolated")}
          </label>
        </div>

        <div className="rounded-[var(--ag-r-md)] bg-[var(--ag-surface-2)] rounded-[var(--ag-r-md)] px-3 py-3">
          <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t("agentAddons.browser.serverName", { name: BROWSER_ADDON_SERVER_NAME })}
          </p>
          <code className="mt-1 block break-all font-mono text-[10px] leading-4 text-[var(--ag-text-2)]">
            {status?.command}
          </code>
          <p className="text-[var(--ag-text-3)] mt-1.5 break-all text-[10px] leading-4">
            {status?.file ?? t("agentAddons.browser.codexTarget")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" className="h-8 text-[11px]" disabled={busy || loading} onClick={install}>
            {busy ? <SpinIcon icon={LoaderCircle} className="size-3.5" /> : null}
            {installed ? t("agentAddons.browser.update") : t("agentAddons.browser.install")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-[11px]"
            disabled={busy || loading || !installed}
            onClick={remove}
          >
            <Trash2 className="size-3" />
            {t("agentAddons.browser.remove")}
          </Button>
        </div>

        <section className="space-y-3 rounded-[var(--ag-r-lg)] border border-[var(--ag-line)] bg-[var(--ag-surface-2)]/55 p-4">
          <div>
            <p className="text-[12px] font-semibold text-[var(--ag-text)]">{t("agentAddons.browser.runTest")}</p>
            <p className="text-[var(--ag-text-3)] mt-0.5 text-[10px] leading-4">{t("agentAddons.browser.scenarioHint")}</p>
          </div>
          <Field label={t("agentAddons.browser.scenario")} hint={t("agentAddons.browser.scenarioHint")}>
            <Textarea
              value={scenario}
              onChange={(event) => setScenario(event.target.value)}
              rows={3}
              placeholder={t("agentAddons.browser.scenarioPlaceholder")}
              className="text-[12px]"
            />
          </Field>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-[11px]"
            disabled={!installed}
            onClick={() => void startTest()}
          >
            <Play className="size-3" />
            {t("agentAddons.browser.runTest")}
          </Button>
        </section>
      </div>
    </AddonCard>
  );
}

export function AgentAddonStudio({ path, onBack }: { path: string; onBack: () => void }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [activeAddon, setActiveAddon] = useState<"browser" | "barcode">("browser");

  return (
    <CapabilityStudioShell
      title={t("agentAddons.title")}
      subtitle={`${repoName(path)} · ${t("agentAddons.subtitle")}`}
      mark={(
        <span className="rounded-[var(--ag-r-md)] bg-[var(--ag-surface-2)] grid size-9 shrink-0 place-items-center rounded-xl">
          <Blocks className="size-4" />
        </span>
      )}
      onBack={onBack}
      backLabel={t("agentCapabilities.backToChat")}
      tabs={[
        { id: "browser", label: t("agentAddons.browser.title"), icon: <Globe className="size-3.5" /> },
        { id: "barcode", label: t("agentAddons.barcode.title"), icon: <Barcode className="size-3.5" /> },
      ]}
      tabValue={activeAddon}
      onTabChange={(id) => setActiveAddon(id as "browser" | "barcode")}
      tabsLabel={t("agentAddons.title")}
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="w-full min-w-0 px-[clamp(1rem,2.5vw,2rem)] pb-10 pt-6 max-sm:px-3 mx-auto max-w-5xl">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={activeAddon}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={SPRING_PANEL}
            >
              {activeAddon === "browser" ? (
                <BrowserAddonCard path={path} onBack={onBack} />
              ) : (
                <BarcodeAddonCard />
              )}
            </m.div>
          </AnimatePresence>
        </div>
      </ScrollArea>
    </CapabilityStudioShell>
  );
}
