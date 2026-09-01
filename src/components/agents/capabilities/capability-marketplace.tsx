import {
  ArrowUpRight,
  Blocks,
  Bot,
  Download,
  ExternalLink,
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

import { CapabilityEcosystemBoard } from "@/components/agents/capabilities/capability-ecosystem-board";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { AgentSectionTabs } from "@/components/agents/ui/agent-section-tabs";
import { AgentsEnter } from "@/components/agents/ui/agents-enter";
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

  useEffect(() => {
    if (!market.result && !market.loading) void market.search();
    // Erste Suche beim Öffnen; danach steuert der Nutzer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const detail = market.detail;

  const runSearch = useCallback(() => {
    market.setQuery(input);
    void market.search();
  }, [input, market]);

  const openRepo = useCallback(
    async (repo: MarketRepo) => {
      setResults([]);
      setChosenAssets(new Set());
      const loaded = await market.inspect(repo.fullName, repo.defaultBranch || undefined);
      if (loaded) {
        // Vorauswahl: alles, was zur gerade gewählten Kategorie passt.
        setChosenAssets(
          new Set(assetsFor(loaded, market.kind).slice(0, 20).map((asset) => `${asset.kind}:${asset.path}`)),
        );
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [detail, loadInventory, market, path, t, targets]);

  const items = market.result?.items ?? [];

  return (
    <ScrollArea className="min-h-0 flex-1">
      <AgentsEnter className="mx-auto w-full max-w-6xl space-y-4 p-5">
        <section className="ag-card overflow-hidden">
          <div className="border-b border-[var(--ag-line)] p-4">
            <h2 className="text-[13px] font-semibold tracking-tight">{t("agentCapabilities.market.title")}</h2>
            <p className="ag-muted mt-1 max-w-2xl text-[11px] leading-5">{t("agentCapabilities.market.explainer")}</p>
          </div>

          <div className="space-y-3 p-4">
            <p className="ag-label">{t("agentCapabilities.market.installInto")}</p>
            <CapabilityEcosystemBoard
              targets={inventory.targets}
              items={inventory.items}
              selected={targets}
              onToggleTarget={(target) =>
                setTargets((current) =>
                  current.some((entry) => targetKey(entry) === targetKey(target))
                    ? current.filter((entry) => targetKey(entry) !== targetKey(target))
                    : [...current, target],
                )
              }
              requiredKinds={marketRequiredKinds(market.kind)}
            />
            <p className="ag-faint text-[10px]">
              {targets.length ? t("agentCapabilities.market.destinationsHint") : t("agentCapabilities.market.pickDestinations")}
            </p>
          </div>

          <div className="space-y-3 border-t border-[var(--ag-line)] p-4">
          <AgentSectionTabs
            value={market.kind}
            onChange={(id) => {
              market.setKind(id as MarketKind);
              void market.search();
            }}
            label={t("agentCapabilities.market.title")}
            layoutId="market-kind-tab"
            items={MARKET_KINDS.map((kind) => {
              const Icon = KIND_ICONS[kind];
              return {
                id: kind,
                label: t(`agentCapabilities.market.kinds.${kind}`),
                icon: <Icon className="size-3.5" />,
              };
            })}
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="ag-faint pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") runSearch();
                }}
                placeholder={t("agentCapabilities.market.searchPlaceholder")}
                className="h-8 rounded-full border-[var(--ag-line)] bg-[var(--ag-surface-2)] pl-8 text-[11px] shadow-none"
              />
            </div>
            <Select
              value={market.sort}
              onValueChange={(value) => {
                market.setSort(value as MarketSort);
                void market.search();
              }}
            >
              <SelectTrigger className="h-8 w-36 text-[11px]">
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
            <Select
              value={String(market.minStars)}
              onValueChange={(value) => {
                market.setMinStars(Number(value));
                void market.search();
              }}
            >
              <SelectTrigger className="h-8 w-44 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 10, 100, 1000].map((stars) => (
                  <SelectItem key={stars} value={String(stars)}>
                    {stars === 0 ? t("agentCapabilities.market.anyStars") : t("agentCapabilities.market.minStars", { stars })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" className="h-8" disabled={market.loading} onClick={runSearch}>
              {t("agentCapabilities.market.search")}
            </Button>
          </div>

          {market.result && !market.result.authenticated ? (
            <p className="ag-faint mt-2 text-[10px]">{t("agentCapabilities.market.anonymousHint")}</p>
          ) : null}
          {market.result?.notes.map((note) => (
            <p key={note} className="text-[10px] text-amber-600 dark:text-amber-400">
              {note}
            </p>
          ))}
          </div>
        </section>

        {market.error ? <CapabilityError message={market.error} /> : null}

        {market.loading ? (
          <CapabilityLoading label={t("agentCapabilities.market.loading")} />
        ) : items.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <ProgressiveCapabilityList
              items={items}
              getKey={(repo) => repo.fullName}
              resetKey={`${market.kind}:${market.sort}:${market.minStars}:${market.result?.queries.join("|") ?? ""}`}
              moreLabel={(count) => t("agentCapabilities.showMore", { count })}
              renderItem={(repo: MarketRepo) => {
                const present = repoPresence(repo, market.kind, inventory.items);
                return (
                <m.article
                  className="ag-card flex flex-col gap-2 p-3.5"
                  whileHover={{ y: -1 }}
                  transition={SPRING_PANEL}
                >
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
                    <Badge variant="outline" className={cn("h-5 shrink-0 rounded px-1.5 text-[9px]", POPULARITY_TONE[repo.popularity])}>
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
                    {repo.license ? <span>{repo.license}</span> : null}
                    <span>{t("agentCapabilities.market.updated", { date: shortDate(repo.pushedAt) })}</span>
                    {repo.archived ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <TriangleAlert className="size-3" /> {t("agentCapabilities.market.archived")}
                      </span>
                    ) : null}
                  </div>

                  {repo.topics.length ? (
                    <div className="flex flex-wrap gap-1">
                      {repo.topics.slice(0, 5).map((topic) => (
                        <Badge key={topic} variant="outline" className="h-4 rounded px-1 text-[8px]">
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-auto flex items-center gap-1.5 pt-1">
                    <Button type="button" size="sm" className="h-7 px-2 text-[10px]" onClick={() => void openRepo(repo)}>
                      <Download className="size-3" />
                      {t("agentCapabilities.market.inspect")}
                    </Button>
                    <a
                      href={repo.htmlUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="ag-pill inline-flex h-7 items-center gap-1 px-2 text-[10px]"
                    >
                      <ExternalLink className="size-3" />
                      GitHub
                    </a>
                    {present.length ? (
                      <span className="ml-auto inline-flex items-center gap-1" title={t("agentCapabilities.market.alreadyOn", { clis: present.join(", ") })}>
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
      </AgentsEnter>

      <Dialog
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) {
            market.clearDetail();
            setResults([]);
          }
        }}
      >
        <DialogContent className="flex h-[min(92vh,940px)] w-full flex-col gap-3 overflow-hidden sm:max-w-[min(96vw,1180px)]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              {detail?.repo.fullName}
              {detail ? (
                <a
                  href={detail.repo.htmlUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="ag-faint inline-flex items-center gap-1 text-[10px] font-normal"
                >
                  <ArrowUpRight className="size-3" /> GitHub
                </a>
              ) : null}
            </DialogTitle>
            <DialogDescription>
              {detail
                ? t("agentCapabilities.market.detailDescription", {
                    stars: compactNumber(detail.repo.stars),
                    ref: detail.refName,
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>

          {market.inspecting ? (
            <CapabilityLoading label={t("agentCapabilities.market.inspecting")} />
          ) : detail ? (
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <ScrollArea className="min-h-0 pr-2">
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5 text-[11px] text-amber-700 dark:text-amber-300">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>{t("agentCapabilities.market.trustWarning")}</span>
                </div>

                {detail.readmeExcerpt ? (
                  <section>
                    <p className="ag-label mb-1.5">{t("agentCapabilities.market.readme")}</p>
                    <p className="ag-muted whitespace-pre-wrap text-[11px] leading-5">
                      {detail.readmeExcerpt}
                    </p>
                  </section>
                ) : null}
              </div>
              </ScrollArea>

              <ScrollArea className="min-h-0 pr-2">
              <div className="space-y-4">
                <section>
                  <p className="ag-label mb-1.5">{t("agentCapabilities.market.assets")}</p>
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
                                <span className="truncate text-[11px] font-medium">{asset.name}</span>
                                <Badge variant="outline" className="h-4 rounded px-1 text-[8px]">
                                  {t(`agentCapabilities.market.assetKinds.${asset.kind}`)}
                                </Badge>
                                {assetLocalPresence(asset.name, assetTargetKind(asset.kind), inventory.items).map((cli) => (
                                  <CapabilityCliMark key={cli} cli={cli} logoClassName="size-2.5" />
                                ))}
                              </span>
                              <span className="ag-faint block truncate font-mono text-[9px]">{asset.path}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="ag-faint text-[11px]">{t("agentCapabilities.market.noAssets")}</p>
                  )}
                  {detail.truncated ? (
                    <p className="ag-faint mt-1.5 text-[10px]">{t("agentCapabilities.market.truncated")}</p>
                  ) : null}
                </section>

                {detail.mcpSuggestion ? (
                  <section className="ag-card p-3">
                    <p className="ag-label mb-1">{t("agentCapabilities.market.mcpSuggestion")}</p>
                    <p className="ag-faint break-all font-mono text-[10px]">
                      {detail.mcpSuggestion.command} {detail.mcpSuggestion.args.join(" ")}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7 px-2 text-[10px]"
                      disabled={market.installing || !targets.length}
                      onClick={() => void addSuggestedMcp()}
                    >
                      <PlugZap className="size-3" />
                      {t("agentCapabilities.market.addMcp")}
                    </Button>
                  </section>
                ) : null}

                <section>
                  <p className="ag-label mb-1.5">{t("agentCapabilities.market.installTargets")}</p>
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
                </section>

                {results.length ? (
                  <section>
                    <p className="ag-label mb-1.5">{t("agentCapabilities.hub.results")}</p>
                    <ul className="space-y-1 text-[11px]">
                      {results.map((entry, index) => (
                        <li key={`${entry.name}:${entry.target}:${index}`} className="break-all">
                          <span className={entry.status === "error" ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}>
                            {entry.name}
                          </span>
                          <span className="ag-faint"> → {entry.target}: {entry.message}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
              </ScrollArea>
            </div>
          ) : null}

          <DialogFooter className="shrink-0 flex-col items-stretch gap-2 border-t border-[var(--ag-line)] pt-3 sm:flex-row sm:items-center">
            <label className="mr-auto flex items-center gap-2 text-[11px]">
              <Switch checked={overwrite} onCheckedChange={setOverwrite} />
              {t("agentCapabilities.hub.overwrite")}
            </label>
            <Button type="button" variant="outline" onClick={() => market.clearDetail()}>
              {t("common.close")}
            </Button>
            <Button
              type="button"
              disabled={market.installing || !selectedAssets.length || !targets.length}
              onClick={() => void install()}
            >
              <Download className="size-3.5" />
              {t("agentCapabilities.market.install", { count: selectedAssets.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
