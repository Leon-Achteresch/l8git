import { area, curveMonotoneX } from "d3-shape";
import { ArrowDown, ExternalLink, Flame, Moon, Search, Sparkles, Sun, Trash2, Trophy, UserPlus } from "lucide-react";
import { memo, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { formatRelative } from "@/lib/format";
import { contributorInsights, type ContributorInsight, type LangLines } from "@/lib/hub/contributor-insights";
import type { HubAccount, HubLanguage, HubRepoDetail } from "@/lib/hub/types";
import { useHubQuery } from "@/lib/hub/use-hub-query";
import { cn } from "@/lib/utils";

import { compact, EmptyRow, ErrorRow, openExternal, Panel, SkeletonRows, UserAvatar } from "./hub-bits";
import { langColor, LanguageBar, ShareRing } from "./hub-viz";

const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const OTHERS = "color-mix(in oklab, var(--muted-foreground) 35%, transparent)";

type Sort = "commits" | "additions" | "deletions" | "lastActive";

const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());
const pct = (n: number, total: number) => (total ? `${n / total < 0.01 && n > 0 ? "<1" : Math.round((n / total) * 100)}%` : "–");

export function HubContributorsTab({ account, repo }: { account: HubAccount; repo: HubRepoDetail }) {
  const { t } = useTranslation();
  // Bumping the key refetches just this view; a global refresh would clear every hub query.
  const [nonce, setNonce] = useState(0);
  const retry = () => setNonce((n) => n + 1);
  const q = useHubQuery(account, `contributorStats:${repo.fullName}:${nonce}`, (ad, a) => ad.contributorStats(a, repo.fullName));
  const data = useMemo(() => (q.data ? contributorInsights(q.data, repo.contributors) : null), [q.data, repo.contributors]);
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("commits");
  const [filter, setFilter] = useState("");

  // Color languages like the repo's own list; unknown ones fall back to the chart palette.
  const colorOf = useMemo(() => {
    const byName = new Map(repo.languages.map((l, i) => [l.name.toLowerCase(), langColor(l, i)]));
    const names = data?.languages.map((l) => l.name) ?? [];
    return (name: string) => byName.get(name.toLowerCase()) ?? SERIES[Math.max(0, names.indexOf(name)) % SERIES.length];
  }, [repo.languages, data]);
  const colorFor = useMemo(() => new Map(data?.people.slice(0, SERIES.length).map((p, i) => [p.login, SERIES[i]])), [data]);

  if (q.error && !data) return <ErrorRow error={q.error} onRetry={retry} />;
  if (!data) return <SkeletonRows n={8} />;
  if (data.people.length === 0) return <EmptyRow>{t("hub.contrib.empty")}</EmptyRow>;

  const person = data.people.find((p) => p.login === selected) ?? data.people[0];
  const needle = filter.trim().toLowerCase();
  const rows = data.people
    .filter((p) => !needle || p.login.toLowerCase().includes(needle))
    .sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1));
  const { totals } = data;

  return (
    <div className="border-t border-border/60">
      {q.data?.computing && (
        <div className="flex items-center gap-3 border-b border-border/60 bg-muted/30 px-5 py-2 text-xs text-muted-foreground">
          {t("hub.contrib.computing")}
          <button type="button" onClick={retry} className="underline-offset-2 hover:text-foreground hover:underline">
            {t("common.retry")}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 border-b border-border/60 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi label={t("hub.contrib.kpi.people")} value={compact(totals.contributors)} />
        <Kpi label={t("hub.contrib.kpi.commits")} value={compact(totals.commits)} />
        <Kpi label={t("hub.contrib.kpi.added")} value={totals.additions == null ? "–" : `+${compact(totals.additions)}`} tone="text-git-added" />
        <Kpi label={t("hub.contrib.kpi.deleted")} value={totals.deletions == null ? "–" : `−${compact(totals.deletions)}`} tone="text-destructive" />
        <Kpi label={t("hub.contrib.kpi.active30")} value={String(totals.active30)} />
        <Kpi label={t("hub.contrib.kpi.busFactor")} value={String(totals.busFactor)} hint={t("hub.contrib.kpi.busFactorHint")} />
      </div>

      <div className="grid xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 xl:border-r xl:border-border/60">
          <Panel title={t("hub.contrib.activity")}>
            <div className="px-5 pt-4 pb-3">
              <ActivityChart people={data.people} weeks={data.weeks} colorFor={colorFor} />
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {data.people.slice(0, SERIES.length).map((p) => (
                  <span key={p.login} className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: colorFor.get(p.login) }} />
                    {p.login}
                  </span>
                ))}
                {data.people.length > SERIES.length && (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ background: OTHERS }} />
                    {t("hub.contrib.others", { n: data.people.length - SERIES.length })}
                  </span>
                )}
              </div>
            </div>
          </Panel>

          <Panel
            title={t("hub.contrib.leaderboard")}
            count={rows.length}
            action={
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
                <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("hub.contrib.filter")} className="h-7 w-44 pl-6 text-xs" />
              </div>
            }
            className="border-t border-border/60"
          >
            <div className="grid grid-cols-[28px_minmax(120px,1fr)_120px_96px_120px_88px] items-center gap-3 border-b border-border/40 px-5 py-1.5 text-[11px] text-muted-foreground max-lg:grid-cols-[28px_minmax(120px,1fr)_96px_88px]">
              <span>#</span>
              <span>{t("hub.contrib.col.person")}</span>
              <span className="max-lg:hidden">{t("hub.contrib.col.trend")}</span>
              <SortHead id="commits" sort={sort} onSort={setSort}>{t("hub.contrib.col.commits")}</SortHead>
              <span className="flex gap-2 max-lg:hidden">
                <SortHead id="additions" sort={sort} onSort={setSort}>+</SortHead>
                <SortHead id="deletions" sort={sort} onSort={setSort}>−</SortHead>
              </span>
              <SortHead id="lastActive" sort={sort} onSort={setSort}>{t("hub.contrib.col.last")}</SortHead>
            </div>
            <div className="divide-y divide-border/40">
              {rows.map((p) => (
                <button
                  key={p.login}
                  type="button"
                  onClick={() => setSelected(p.login)}
                  aria-pressed={p.login === person.login}
                  className={cn(
                    "grid w-full grid-cols-[28px_minmax(120px,1fr)_120px_96px_120px_88px] items-center gap-3 px-5 py-2 text-left text-[13px] transition-colors hover:bg-muted/40 max-lg:grid-cols-[28px_minmax(120px,1fr)_96px_88px]",
                    p.login === person.login && "bg-muted/50",
                  )}
                >
                  <span className="font-mono text-xs text-muted-foreground">{data.people.indexOf(p) + 1}</span>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <UserAvatar src={p.avatarUrl} login={p.login} size={22} />
                    <span className="min-w-0">
                      <span className="block truncate">{p.login}</span>
                      {p.languages.length > 0 && (
                        <span className="mt-0.5 flex h-1 w-24 gap-px overflow-hidden rounded-full bg-muted">
                          {p.languages.slice(0, 4).map((l) => (
                            <span key={l.name} title={l.name} style={{ flexGrow: l.lines, background: colorOf(l.name) }} />
                          ))}
                        </span>
                      )}
                    </span>
                  </span>
                  <Bars values={p.weekly.slice(-24)} color={colorFor.get(p.login) ?? "var(--muted-foreground)"} className="h-5 max-lg:hidden" />
                  <span>
                    <span className="font-mono text-xs">{compact(p.commits)}</span>
                    <span className="ml-1.5 text-[11px] text-muted-foreground">{pct(p.commits, totals.commits)}</span>
                    <span className="mt-1 block h-0.5 rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${(p.commits / (data.people[0].commits || 1)) * 100}%` }} />
                    </span>
                  </span>
                  <span className="font-mono text-xs max-lg:hidden">
                    <span className="text-git-added">+{p.additions == null ? "–" : compact(p.additions)}</span>{" "}
                    <span className="text-destructive">−{p.deletions == null ? "–" : compact(p.deletions)}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{p.lastActive ? formatRelative(iso(p.lastActive)!) : "–"}</span>
                </button>
              ))}
              {rows.length === 0 && <EmptyRow>{t("hub.contrib.noMatch")}</EmptyRow>}
            </div>
          </Panel>
          <div className="grid border-t border-border/60 lg:grid-cols-2">
            <Panel title={t("hub.contrib.highlights")}>
              <Highlights people={data.people} exactFirst={data.source === "weekly"} onPick={setSelected} />
            </Panel>
            <Panel title={t("hub.contrib.languagesByPerson")} className="border-t border-border/60 lg:border-t-0 lg:border-l">
              <LanguageMatrix people={data.people} team={data.languages} colorOf={colorOf} onPick={setSelected} />
            </Panel>
          </div>
          <Panel title={t("hub.contrib.punchTeam")} className="border-t border-border/60">
            <div className="max-w-xl px-5 py-4">
              <PunchCard values={data.punch} />
            </div>
          </Panel>
        </div>

        <aside className="border-t border-border/60 xl:border-t-0">
          <PersonDetail person={person} total={totals.commits} weeks={data.weeks} color={colorFor.get(person.login) ?? "var(--chart-1)"} colorOf={colorOf} />
        </aside>
      </div>

      <p className="border-t border-border/60 px-5 py-3 text-[11px] text-muted-foreground">
        {data.source === "weekly" ? t("hub.contrib.sourceWeekly") : t("hub.contrib.sourceSample")}{" "}
        {t("hub.contrib.sampleNote", { commits: data.sampleSize, files: data.filesSampled })}
      </p>
    </div>
  );
}

function Kpi({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="min-w-0 border-border/60 px-5 py-4 [&:not(:first-child)]:border-l" title={hint}>
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1.5 font-mono text-2xl", tone)}>{value}</div>
    </div>
  );
}

function SortHead({ id, sort, onSort, children }: { id: Sort; sort: Sort; onSort: (s: Sort) => void; children: ReactNode }) {
  return (
    <button type="button" onClick={() => onSort(id)} className={cn("flex items-center gap-0.5 text-left hover:text-foreground", sort === id && "text-foreground")}>
      {children}
      {sort === id && <ArrowDown className="size-3" />}
    </button>
  );
}

/** Weekly commits as a stacked area: top contributors in color, everyone else as one grey band. */
const ActivityChart = memo(function ActivityChart({ people, weeks, colorFor }: { people: ContributorInsight[]; weeks: number[]; colorFor: Map<string, string> }) {
  const { i18n } = useTranslation();
  const W = 800;
  const H = 140;
  const { paths, max, ticks } = useMemo(() => {
    const series = people.slice(0, SERIES.length).map((p) => ({ key: p.login, values: p.weekly }));
    const rest = people.slice(SERIES.length);
    if (rest.length) series.push({ key: "", values: weeks.map((_, i) => rest.reduce((s, p) => s + p.weekly[i], 0)) });
    const base = weeks.map(() => 0);
    const stacked = series.map((s) => {
      const lo = [...base];
      s.values.forEach((v, i) => (base[i] += v));
      return { key: s.key, lo, hi: [...base] };
    });
    const max = Math.max(1, ...base);
    const x = (i: number) => (i / Math.max(1, weeks.length - 1)) * W;
    const y = (v: number) => H - (v / max) * (H - 6);
    const gen = area<number>()
      .curve(curveMonotoneX)
      .x((_, i) => x(i));
    const fmt = new Intl.DateTimeFormat(i18n.language, { month: "short" });
    const ticks = weeks.flatMap((w, i) => (i % 8 === 0 ? [{ x: x(i), label: fmt.format(w) }] : []));
    return {
      paths: stacked.map((s) => ({ key: s.key, d: gen.y0((_, i) => y(s.lo[i])).y1((_, i) => y(s.hi[i]))(s.hi) ?? "" })),
      max,
      ticks,
    };
  }, [people, weeks, i18n.language]);
  return (
    <div className="relative">
      <span className="absolute top-0 left-0 font-mono text-[10px] text-muted-foreground">{max}</span>
      <svg viewBox={`0 0 ${W} ${H + 16}`} preserveAspectRatio="none" className="h-44 w-full" aria-hidden>
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
        {paths.map((p) => (
          <path key={p.key || "_rest"} d={p.d} fill={p.key ? colorFor.get(p.key) : OTHERS} fillOpacity={p.key ? 0.75 : 1} />
        ))}
        {ticks.map((tk) => (
          <text key={tk.x} x={tk.x} y={H + 12} fontSize="10" fill="var(--muted-foreground)">
            {tk.label}
          </text>
        ))}
      </svg>
    </div>
  );
});

function Bars({ values, color, className }: { values: number[]; color: string; className?: string }) {
  const max = Math.max(1, ...values);
  return (
    <span className={cn("flex items-end gap-px", className)} aria-hidden>
      {values.map((v, i) => (
        <span key={i} className="min-h-px flex-1 rounded-[1px]" style={{ height: v ? `${Math.max(12, (v / max) * 100)}%` : "1px", background: v ? color : "var(--muted)" }} />
      ))}
    </span>
  );
}

function PunchCard({ values }: { values: number[] }) {
  const { t, i18n } = useTranslation();
  const max = Math.max(1, ...values);
  const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: "short" });
  // Monday first; 2026-10-11 is a Sunday, so 11 + d labels weekday d.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="grid gap-1 text-[10px] text-muted-foreground">
      {order.map((d) => (
        <div key={d} className="grid grid-cols-[28px_repeat(24,1fr)] items-center gap-0.5">
          <span>{fmt.format(new Date(2026, 9, 11 + d))}</span>
          {Array.from({ length: 24 }, (_, h) => {
            const v = values[d * 24 + h];
            return (
              <span key={h} className="grid aspect-square place-items-center" title={t("hub.contrib.punchCell", { n: v, h })}>
                <span className="rounded-full bg-[var(--chart-1)]" style={{ width: `${v ? 30 + (v / max) * 70 : 14}%`, height: `${v ? 30 + (v / max) * 70 : 14}%`, opacity: v ? 0.35 + (v / max) * 0.65 : 0.15 }} />
              </span>
            );
          })}
        </div>
      ))}
      <div className="grid grid-cols-[28px_repeat(24,1fr)] gap-0.5">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="text-center">{h % 6 === 0 ? h : ""}</span>
        ))}
      </div>
      <span className="mt-1">{t("hub.contrib.localTime")}</span>
    </div>
  );
}

function share(list: LangLines[]): HubLanguage[] {
  const total = list.reduce((s, l) => s + l.lines, 0) || 1;
  return list.map((l) => ({ name: l.name, color: null, share: l.lines / total }));
}

function PersonDetail({
  person: p,
  total,
  weeks,
  color,
  colorOf,
}: {
  person: ContributorInsight;
  total: number;
  weeks: number[];
  color: string;
  colorOf: (name: string) => string;
}) {
  const { t, i18n } = useTranslation();
  const fmt = new Intl.DateTimeFormat(i18n.language, { month: "short", year: "numeric" });
  const langs = share(p.languages);
  const busiest = p.weekly.reduce((best, v, i) => (v > p.weekly[best] ? i : best), 0);
  const facts: [string, ReactNode][] = [
    [t("hub.contrib.kpi.commits"), `${compact(p.commits)} · ${pct(p.commits, total)}`],
    [t("hub.contrib.kpi.added"), <span className="text-git-added">{p.additions == null ? "–" : `+${compact(p.additions)}`}</span>],
    [t("hub.contrib.kpi.deleted"), <span className="text-destructive">{p.deletions == null ? "–" : `−${compact(p.deletions)}`}</span>],
    [t("hub.contrib.avgSize"), p.avgSize == null ? "–" : t("hub.contrib.lines", { n: Math.round(p.avgSize) })],
    [t("hub.contrib.activeWeeks"), String(p.activeWeeks)],
    [t("hub.contrib.streak"), t("hub.contrib.weeksN", { n: p.longestStreak })],
    [t("hub.contrib.first"), p.firstActive ? fmt.format(p.firstActive) : "–"],
    [t("hub.contrib.last"), p.lastActive ? formatRelative(iso(p.lastActive)!) : "–"],
  ];
  return (
    <div className="sticky top-0">
      <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
        <UserAvatar src={p.avatarUrl} login={p.login} size={44} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold">{p.login}</div>
          <div className="text-xs text-muted-foreground">
            {p.languages[0] ? t("hub.contrib.mainly", { lang: p.languages[0].name }) : t("hub.contrib.noLang")}
          </div>
        </div>
        {p.url && (
          <button type="button" onClick={() => openExternal(p.url!)} className="text-muted-foreground hover:text-foreground" title={t("hub.contrib.profile")} aria-label={t("hub.contrib.profile")}>
            <ExternalLink className="size-4" />
          </button>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-b border-border/60 px-5 py-4 text-xs">
        {facts.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 truncate font-mono text-[13px]">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="border-b border-border/60 px-5 py-4">
        <h4 className="mb-2 flex items-center justify-between text-xs font-medium">
          {t("hub.contrib.weekly")}
          {p.weekly[busiest] > 0 && (
            <span className="font-normal text-muted-foreground">
              {t("hub.contrib.peak", { n: p.weekly[busiest], when: new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short" }).format(weeks[busiest]) })}
            </span>
          )}
        </h4>
        <Bars values={p.weekly} color={color} className="h-12" />
      </section>

      <section className="border-b border-border/60 px-5 py-4">
        <h4 className="mb-2.5 text-xs font-medium">{t("hub.repo.languages")}</h4>
        {langs.length ? (
          <div className="flex items-center gap-4">
            <ShareRing parts={p.languages.slice(0, 6).map((l) => ({ value: l.lines, color: colorOf(l.name), label: l.name }))} size={76} />
            <div className="grid min-w-0 flex-1 gap-1 text-xs">
              {langs.slice(0, 6).map((l) => (
                <span key={l.name} className="flex items-center gap-1.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: colorOf(l.name) }} />
                  <span className="truncate">{l.name}</span>
                  <span className="ml-auto font-mono text-muted-foreground">{pct(l.share, 1)}</span>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("hub.contrib.noLang")}</p>
        )}
        {p.dirs.length > 0 && (
          <div className="mt-4 grid gap-1">
            <h4 className="mb-1 text-xs font-medium">{t("hub.contrib.areas")}</h4>
            {p.dirs.map((d) => (
              <div key={d.name} className="grid grid-cols-[1fr_80px] items-center gap-2 text-xs">
                <span className="truncate font-mono text-muted-foreground">{d.name}</span>
                <span className="h-1 rounded-full bg-muted">
                  <span className="block h-full rounded-full" style={{ width: `${(d.lines / p.dirs[0].lines) * 100}%`, background: color }} />
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border-b border-border/60 px-5 py-4">
        <h4 className="mb-2 text-xs font-medium">{t("hub.contrib.punch")}</h4>
        <PunchCard values={p.punch} />
      </section>

      <section className="px-5 py-4">
        <h4 className="mb-2 text-xs font-medium">{t("hub.contrib.recent")}</h4>
        {p.sample.length ? (
          <div className="grid gap-0.5">
            {p.sample.slice(0, 8).map((c) => (
              <button key={c.sha} type="button" onClick={() => openExternal(c.url)} className="flex items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-muted/40">
                <span className="font-mono text-muted-foreground">{c.sha.slice(0, 7)}</span>
                <span className="min-w-0 flex-1 truncate">{c.message}</span>
                {c.additions != null && (
                  <span className="shrink-0 font-mono">
                    <span className="text-git-added">+{c.additions}</span> <span className="text-destructive">−{c.deletions}</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("hub.contrib.noRecent")}</p>
        )}
      </section>
    </div>
  );
}

function Highlights({ people, exactFirst, onPick }: { people: ContributorInsight[]; exactFirst: boolean; onPick: (login: string) => void }) {
  const { t } = useTranslation();
  const best = (score: (p: ContributorInsight) => number | null, min = 0) => {
    let out: { p: ContributorInsight; v: number } | null = null;
    for (const p of people) {
      const v = score(p);
      if (v != null && v > min && (!out || v > out.v)) out = { p, v };
    }
    return out;
  };
  // Time-of-day shares need a few commits to mean anything.
  const timeShare = (p: ContributorInsight, hit: (day: number, hour: number) => boolean) =>
    p.sample.length < 3 ? null : p.punch.reduce((s, n, i) => s + (hit(Math.floor(i / 24), i % 24) ? n : 0), 0) / p.sample.length;
  const items: { icon: ReactNode; label: string; hit: { p: ContributorInsight; v: number } | null; value: (v: number) => string }[] = [
    { icon: <Trophy />, label: t("hub.contrib.hl.top"), hit: best((p) => p.commits), value: (v) => t("hub.contrib.commitsN", { n: compact(v) }) },
    { icon: <Sparkles />, label: t("hub.contrib.hl.builder"), hit: best((p) => p.additions), value: (v) => `+${compact(v)}` },
    { icon: <Trash2 />, label: t("hub.contrib.hl.cleaner"), hit: best((p) => p.deletions), value: (v) => `−${compact(v)}` },
    { icon: <Flame />, label: t("hub.contrib.hl.streak"), hit: best((p) => p.longestStreak), value: (v) => t("hub.contrib.weeksN", { n: v }) },
    // A sample only knows recent commits, so "first" there is not a real first contribution.
    { icon: <UserPlus />, label: t("hub.contrib.hl.newest"), hit: exactFirst ? best((p) => p.firstActive) : null, value: (v) => formatRelative(iso(v)!) },
    { icon: <Moon />, label: t("hub.contrib.hl.night"), hit: best((p) => timeShare(p, (_, h) => h >= 22 || h < 5)), value: (v) => pct(v, 1) },
    { icon: <Sun />, label: t("hub.contrib.hl.weekend"), hit: best((p) => timeShare(p, (d) => d === 0 || d === 6)), value: (v) => pct(v, 1) },
  ];
  return (
    <div className="divide-y divide-border/40">
      {items
        .filter((x) => x.hit)
        .map((x) => (
          <button key={x.label} type="button" onClick={() => onPick(x.hit!.p.login)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-[13px] hover:bg-muted/40 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-[var(--hub-accent)]">
            {x.icon}
            <span className="w-32 shrink-0 text-xs text-muted-foreground">{x.label}</span>
            <UserAvatar src={x.hit!.p.avatarUrl} login={x.hit!.p.login} size={20} />
            <span className="min-w-0 flex-1 truncate">{x.hit!.p.login}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{x.value(x.hit!.v)}</span>
          </button>
        ))}
    </div>
  );
}

function LanguageMatrix({ people, team, colorOf, onPick }: { people: ContributorInsight[]; team: LangLines[]; colorOf: (n: string) => string; onPick: (login: string) => void }) {
  const { t } = useTranslation();
  const withLangs = people.filter((p) => p.languages.length).slice(0, 10);
  if (!withLangs.length) return <EmptyRow>{t("hub.contrib.noLang")}</EmptyRow>;
  const teamShare = share(team).map((l) => ({ ...l, color: colorOf(l.name) }));
  return (
    <div className="px-5 py-4">
      <LanguageBar languages={teamShare} />
      <div className="mt-2 mb-4 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {teamShare.slice(0, 8).map((l) => (
          <span key={l.name} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: l.color }} />
            {l.name}
            <span className="font-mono text-muted-foreground">{pct(l.share, 1)}</span>
          </span>
        ))}
      </div>
      <div className="grid gap-1.5">
        {withLangs.map((p) => (
          <div key={p.login} className="grid grid-cols-[110px_1fr] items-center gap-2 text-xs">
            <button type="button" onClick={() => onPick(p.login)} className="flex min-w-0 items-center gap-1.5 text-left text-muted-foreground hover:text-foreground">
              <UserAvatar src={p.avatarUrl} login={p.login} size={16} />
              <span className="truncate">{p.login}</span>
            </button>
            <LanguageBar languages={share(p.languages).map((l) => ({ ...l, color: colorOf(l.name) }))} />
          </div>
        ))}
      </div>
    </div>
  );
}
