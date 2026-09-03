import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Blocks,
  Bot,
  CheckCircle2,
  Download,
  ExternalLink,
  FileWarning,
  GitFork,
  PlugZap,
  Search,
  ShieldAlert,
  Sparkles,
  SquareTerminal,
  Star,
  TriangleAlert,
  Webhook,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGuideChoice } from "@/components/agents/capabilities/capability-guide-choice";
import { CapabilityGuideSteps } from "@/components/agents/capabilities/capability-guide-steps";
import { CapabilityCliMark } from "@/components/agents/capabilities/capability-cli-mark";
import { CapabilityTargetPicker } from "@/components/agents/capabilities/capability-targets";
import {
  CapabilityEmpty,
  CapabilityError,
  CapabilityLoading,
  ProgressiveCapabilityList,
} from "@/components/agents/capabilities/capability-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { CapabilityItem, CapabilityKind, CapabilityOpResult, CapabilityTargetRef } from "@/lib/agents/capability-hub";
import { assetLocalPresence, defaultTargets, summarizeResults, targetKey, useCapabilityHubStore } from "@/lib/agents/capability-hub";
import type { MarketAsset, MarketKind, MarketRepo, MarketSort } from "@/lib/agents/capability-market";
import {
  MARKET_KINDS,
  MARKET_SORTS,
  assetTargetKind,
  assetsFor,
  useCapabilityMarketStore,
} from "@/lib/agents/capability-market";
import { SPRING_PANEL } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";
import { m } from "motion/react";

const KIND_ICONS: Record<MarketKind, typeof Sparkles> = {
  skill: Sparkles,
  mcp: PlugZap,
  plugin: Blocks,
  hook: Webhook,
  command: SquareTerminal,
};

const ASSET_ICONS: Record<string, typeof Sparkles> = {
  skill: Sparkles,
  command: SquareTerminal,
  agent: Bot,
  mcp: PlugZap,
  hook: Webhook,
  hookScript: Webhook,
  pluginMarketplace: Blocks,
};

const POPULARITY_TONE: Record<string, string> = {
  hot: "border-rose-500/30 text-rose-600 dark:text-rose-400",
  popular: "border-amber-500/30 text-amber-600 dark:text-amber-400",
  growing: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  fresh: "border-sky-500/30 text-sky-600 dark:text-sky-400",
  small: "border-border/60 text-muted-foreground",
};

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function shortDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? "" : new Date(parsed).toLocaleDateString();
}

function marketRequiredKinds(kind: MarketKind): CapabilityKind[] {
  if (kind === "plugin") return ["mcp"];
  if (kind === "command") return ["command", "agent"];
  return [kind];
}

function repoPresence(repo: MarketRepo, kind: MarketKind, items: CapabilityItem[]): string[] {
  const names = [repo.name, repo.name.replace(/-skills?$/iu, "").replace(/-mcp$/iu, "")];
  const found = new Set<string>();
  for (const capKind of marketRequiredKinds(kind)) {
    for (const name of names) {
      for (const cli of assetLocalPresence(name, capKind, items)) found.add(cli);
    }
  }
  return [...found];
}

export function CapabilityMarketplace({ path, query }: { path: string; query: string }) {
  const { t } = useTranslation();
  const market = useCapabilityMarketStore();
  const loadInventory = useCapabilityHubStore((state) => state.load);
  const inventory = useCapabilityHubStore((state) => state.inventory);

  const [step, setStep] = useState(0);
  const [input, setInput] = useState(query);
  const [targets, setTargets] = useState<CapabilityTargetRef[]>([]);
  const [chosenAssets, setChosenAssets] = useState<Set<string>>(new Set());
  const [overwrite, setOverwrite] = useState(false);
  const [results, setResults] = useState<CapabilityOpResult[]>([]);
  const didInitTargets = useRef(false);

  useEffect(() => {
    void loadInventory(path);
  }, [loadInventory, path]);

  useEffect(() => {
    if (didInitTargets.current || !inventory.targets.length) return;
    didInitTargets.current = true;
    setTargets(defaultTargets(inventory.targets, null));
  }, [inventory.targets]);

  const detail = market.detail;

  const runSearch = useCallback(() => {
    market.setQuery(input);
    void market.search();
  }, [input, market]);

  const pickKind = useCallback(
    (kind: MarketKind) => {
      market.setKind(kind);
      setResults([]);
      setStep(1);
      void market.search();
    },
    [market],
  );

  const openRepo = useCallback(
    async (repo: MarketRepo) => {
      setResults([]);
      setChosenAssets(new Set());
      const loaded = await market.inspect(repo.fullName, repo.defaultBranch || undefined);
      if (loaded) {
        setChosenAssets(
          new Set(assetsFor(loaded, market.kind).slice(0, 20).map((asset) => `${asset.kind}:${asset.path}`)),
        );
        setStep(2);
      }
    },
    [market],
  );

  const selectedAssets = useMemo<MarketAsset[]>(
    () => (detail?.assets ?? []).filter((asset) => chosenAssets.has(`${asset.kind}:${asset.path}`)),
    [chosenAssets, detail],
  );

  const install = useCallback(async () => {
    if (!detail || !selectedAssets.length || !targets.length) return;
    try {
      const outcome = await market.install(path, selectedAssets, targets, overwrite);
      setResults(outcome);
      const totals = summarizeResults(outcome);
      if (totals.failed) {
        toast.error(t("agentCapabilities.market.installedWithErrors", { ok: totals.ok, failed: totals.failed }));
      } else {
        toast.success(t("agentCapabilities.market.installed", { count: totals.ok }));
      }
      await loadInventory(path, true);
      setStep(3);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [detail, loadInventory, market, overwrite, path, selectedAssets, t, targets]);

  const addSuggestedMcp = useCallback(async () => {
    if (!detail?.mcpSuggestion || !targets.length) return;
    try {
      const outcome = await market.addMcp(path, detail.mcpSuggestion, targets);
      setResults(outcome);
      const totals = summarizeResults(outcome);
      if (totals.failed) toast.error(t("agentCapabilities.market.installedWithErrors", { ok: totals.ok, failed: totals.failed }));
      else toast.success(t("agentCapabilities.market.installed", { count: totals.ok }));
      await loadInventory(path, true);
      setStep(3);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [detail, loadInventory, market, path, t, targets]);

  const items = market.result?.items ?? [];
  const steps = [
    t("agentCapabilities.market.stepKind"),
    t("agentCapabilities.market.stepSearch"),
    t("agentCapabilities.market.stepInstall"),
    t("agentCapabilities.market.stepDone"),
  ];

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="ag-studio-page space-y-5">
        <CapabilityGuideSteps
          steps={steps}
          current={step}
          onChange={(index) => {
            if (index < 2) {
              market.clearDetail();
              setResults([]);
            }
            setStep(index);
          }}
        />

        {step === 0 ? (
          <section className="ag-guide-panel">
            <h2 className="ag-guide-title">{t("agentCapabilities.market.stepKindTitle")}</h2>
            <p className="ag-guide-hint">{t("agentCapabilities.market.stepKindHint")}</p>
            <div className="ag-guide-choices">
              {MARKET_KINDS.map((kind) => {
                const Icon = KIND_ICONS[kind];
                return (
                  <CapabilityGuideChoice
                    key={kind}
                    selected={market.kind === kind}
                    onSelect={() => pickKind(kind)}
                    mark={
                      <span className="ag-inset grid size-9 place-items-center rounded-[10px]">
                        <Icon className="size-4" />
                      </span>
                    }
                    title={t(`agentCapabilities.market.kinds.${kind}`)}
                    description={t(`agentCapabilities.market.kindHints.${kind}`)}
                  />
                );
              })}
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="ag-guide-panel">
            <h2 className="ag-guide-title">
              {t("agentCapabilities.market.stepSearchTitle", {
                kind: t(`agentCapabilities.market.kinds.${market.kind}`),
              })}
            </h2>
            <p className="ag-guide-hint">{t("agentCapabilities.market.stepSearchHint")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[12rem] flex-1">
                <Search className="ag-faint pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
                <Input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") runSearch();
                  }}
                  placeholder={t("agentCapabilities.market.searchPlaceholder")}
                  className="h-9 rounded-lg border-[var(--ag-line)] bg-[var(--ag-surface-2)] pl-8 text-[12px] shadow-none"
                />
              </div>
              <Select
                value={market.sort}
                onValueChange={(value) => {
                  market.setSort(value as MarketSort);
                  void market.search();
                }}
              >
                <SelectTrigger className="h-9 w-40 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKET_SORTS.map((sort) => (
                    <SelectItem key={sort} value={sort}>
                      {t(`agentCapabilities.market.sorts.${sort}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" className="h-9" disabled={market.loading} onClick={runSearch}>
                {t("agentCapabilities.market.search")}
              </Button>
            </div>
            {market.result && !market.result.authenticated ? (
              <p className="ag-faint text-[11px]">{t("agentCapabilities.market.anonymousHint")}</p>
            ) : null}
            {market.result?.notes.map((note) => (
              <p key={note} className="text-[11px] text-amber-600 dark:text-amber-400">
                {note}
              </p>
            ))}
            {market.error ? <CapabilityError message={market.error} /> : null}
            {market.loading ? (
              <CapabilityLoading label={t("agentCapabilities.market.loading")} />
            ) : items.length ? (
              <div className="ag-studio-cards">
                <ProgressiveCapabilityList
                  items={items}
                  getKey={(repo) => repo.fullName}
                  resetKey={`${market.kind}:${market.sort}:${market.minStars}:${market.result?.queries.join("|") ?? ""}`}
                  moreLabel={(count) => t("agentCapabilities.showMore", { count })}
                  renderItem={(repo: MarketRepo) => {
                    const present = repoPresence(repo, market.kind, inventory.items);
                    return (
                      <m.article className="ag-studio-card gap-3" whileHover={{ y: -1 }} transition={SPRING_PANEL}>
                        <div className="flex items-start gap-2.5">
                          {repo.avatarUrl ? (
                            <img
                              src={repo.avatarUrl}
                              alt=""
                              loading="lazy"
                              className="mt-0.5 size-8 shrink-0 rounded-lg object-cover"
                            />
                          ) : (
                            <span className="ag-inset mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg text-[11px] font-medium uppercase">
                              {repo.owner.slice(0, 1)}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-[12px] font-medium">{repo.fullName}</h3>
                            <p className="ag-muted mt-1 line-clamp-2 text-[11px] leading-4">
                              {repo.description || t("agentCapabilities.market.noDescription")}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn("h-5 shrink-0 rounded px-1.5 text-[9px]", POPULARITY_TONE[repo.popularity])}
                          >
                            {t(`agentCapabilities.market.popularity.${repo.popularity}`)}
                          </Badge>
                        </div>
                        <div className="ag-faint flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                          <span className="inline-flex items-center gap-1">
                            <Star className="size-3" /> {compactNumber(repo.stars)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <GitFork className="size-3" /> {compactNumber(repo.forks)}
                          </span>
                          {repo.language ? <span>{repo.language}</span> : null}
                          <span>{t("agentCapabilities.market.updated", { date: shortDate(repo.pushedAt) })}</span>
                          {repo.archived ? (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <TriangleAlert className="size-3" /> {t("agentCapabilities.market.archived")}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-auto flex items-center gap-1.5 pt-1">
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 px-2.5 text-[11px]"
                            onClick={() => void openRepo(repo)}
                          >
                            {t("agentCapabilities.market.chooseThis")}
                            <ArrowRight className="size-3" />
                          </Button>
                          <a
                            href={repo.htmlUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="ag-pill inline-flex h-8 items-center gap-1 px-2 text-[11px]"
                          >
                            <ExternalLink className="size-3" />
                            GitHub
                          </a>
                          {present.length ? (
                            <span
                              className="ml-auto inline-flex items-center gap-1"
                              title={t("agentCapabilities.market.alreadyOn", { clis: present.join(", ") })}
                            >
                              {present.map((cli) => (
                                <CapabilityCliMark key={cli} cli={cli} logoClassName="size-3" />
                              ))}
                            </span>
                          ) : null}
                        </div>
                      </m.article>
                    );
                  }}
                />
              </div>
            ) : (
              <CapabilityEmpty
                title={t("agentCapabilities.market.emptyTitle")}
                description={t("agentCapabilities.market.emptyDescription")}
              />
            )}
            <div className="ag-guide-nav">
              <Button type="button" variant="ghost" onClick={() => setStep(0)}>
                <ArrowLeft className="size-3.5" />
                {t("tour.back")}
              </Button>
              <span />
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="ag-guide-panel">
            <h2 className="ag-guide-title">
              {detail?.repo.fullName ?? t("agentCapabilities.market.stepInstallTitle")}
            </h2>
            <p className="ag-guide-hint">{t("agentCapabilities.market.stepInstallHint")}</p>
            {market.inspecting ? (
              <CapabilityLoading label={t("agentCapabilities.market.inspecting")} />
            ) : detail ? (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
                <div className="space-y-4">
                  <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5 text-[12px] leading-5 text-amber-800 dark:text-amber-200">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                    <span>{t("agentCapabilities.market.trustWarning")}</span>
                  </div>
                  {detail.readmeExcerpt ? (
                    <p className="ag-muted whitespace-pre-wrap text-[12px] leading-5">{detail.readmeExcerpt}</p>
                  ) : null}
                  <div>
                    <p className="ag-label mb-2">{t("agentCapabilities.market.assets")}</p>
                    {detail.assets.length ? (
                      <div className="space-y-1">
                        {detail.assets.map((asset) => {
                          const key = `${asset.kind}:${asset.path}`;
                          const Icon = ASSET_ICONS[asset.kind] ?? Blocks;
                          return (
                            <label
                              key={key}
                              className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-[var(--ag-hover)]"
                            >
                              <Checkbox
                                checked={chosenAssets.has(key)}
                                onCheckedChange={() =>
                                  setChosenAssets((current) => {
                                    const next = new Set(current);
                                    if (next.has(key)) next.delete(key);
                                    else next.add(key);
                                    return next;
                                  })
                                }
                                className="mt-0.5"
                              />
                              <Icon className="ag-faint mt-0.5 size-3.5 shrink-0" />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate text-[12px] font-medium">{asset.name}</span>
                                  <Badge variant="outline" className="h-4 rounded px-1 text-[8px]">
                                    {t(`agentCapabilities.market.assetKinds.${asset.kind}`)}
                                  </Badge>
                                  {assetLocalPresence(
                                    asset.name,
                                    assetTargetKind(asset.kind),
                                    inventory.items,
                                  ).map((cli) => (
                                    <CapabilityCliMark key={cli} cli={cli} logoClassName="size-2.5" />
                                  ))}
                                </span>
                                <span className="ag-faint block truncate font-mono text-[10px]">{asset.path}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="ag-faint text-[12px]">{t("agentCapabilities.market.noAssets")}</p>
                    )}
                  </div>
                  {detail.mcpSuggestion ? (
                    <div className="ag-card p-3">
                      <p className="ag-label mb-1">{t("agentCapabilities.market.mcpSuggestion")}</p>
                      <p className="ag-faint break-all font-mono text-[11px]">
                        {detail.mcpSuggestion.command} {detail.mcpSuggestion.args.join(" ")}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-2 h-8"
                        disabled={market.installing || !targets.length}
                        onClick={() => void addSuggestedMcp()}
                      >
                        <PlugZap className="size-3.5" />
                        {t("agentCapabilities.market.addMcp")}
                      </Button>
                    </div>
                  ) : null}
                </div>
                <aside className="ag-card space-y-3 p-4">
                  <p className="ag-label">{t("agentCapabilities.market.installTargets")}</p>
                  <p className="ag-muted text-[11px] leading-4">{t("agentCapabilities.market.pickDestinations")}</p>
                  <CapabilityTargetPicker
                    targets={inventory.targets}
                    selected={targets}
                    requiredKinds={[...new Set(selectedAssets.map((asset) => assetTargetKind(asset.kind)))]}
                    onToggle={(target) =>
                      setTargets((current) =>
                        current.some((entry) => targetKey(entry) === targetKey(target))
                          ? current.filter((entry) => targetKey(entry) !== targetKey(target))
                          : [...current, target],
                      )
                    }
                  />
                  <label className="flex items-center gap-2 pt-1 text-[12px]">
                    <Switch checked={overwrite} onCheckedChange={setOverwrite} />
                    {t("agentCapabilities.hub.overwrite")}
                  </label>
                  {detail ? (
                    <a
                      href={detail.repo.htmlUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="ag-faint inline-flex items-center gap-1 text-[11px]"
                    >
                      <ArrowUpRight className="size-3" /> GitHub
                    </a>
                  ) : null}
                </aside>
              </div>
            ) : null}
            <div className="ag-guide-nav">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  market.clearDetail();
                  setStep(1);
                }}
              >
                <ArrowLeft className="size-3.5" />
                {t("tour.back")}
              </Button>
              <Button
                type="button"
                disabled={market.installing || !selectedAssets.length || !targets.length}
                onClick={() => void install()}
              >
                <Download className="size-3.5" />
                {t("agentCapabilities.market.install", { count: selectedAssets.length })}
              </Button>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="ag-guide-panel">
            <h2 className="ag-guide-title">{t("agentCapabilities.market.stepDoneTitle")}</h2>
            <p className="ag-guide-hint">{t("agentCapabilities.market.stepDoneHint")}</p>
            {results.length ? (
              <ul className="space-y-1.5 text-[12px]">
                {results.map((entry, index) => (
                  <li key={`${entry.name}:${entry.target}:${index}`} className="flex items-start gap-2">
                    {entry.status === "error" ? (
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                    ) : entry.status === "skipped" || entry.status === "unsupported" ? (
                      <FileWarning className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                    )}
                    <span className="min-w-0 flex-1 break-all">
                      <span className="font-medium">{entry.name}</span>
                      <span className="ag-faint"> → {entry.target}: {entry.message}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="ag-guide-nav">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  market.clearDetail();
                  setResults([]);
                  setStep(0);
                }}
              >
                {t("agentCapabilities.market.again")}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  market.clearDetail();
                  setResults([]);
                  setStep(1);
                }}
              >
                {t("agentCapabilities.market.moreFromSearch")}
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </ScrollArea>
  );
}
