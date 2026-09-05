import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { AgentActivityHeatmap } from "@/components/agents/profile/AgentActivityHeatmap";
import { AgentBarsCard } from "@/components/agents/profile/AgentBarsCard";
import { AgentProfileCover } from "@/components/agents/profile/AgentProfileCover";
import { AgentStatTiles, buildContributionTiles } from "@/components/agents/profile/AgentStatTiles";
import { AgentTokensCard } from "@/components/agents/profile/AgentTokensCard";
import {
  topStreakDays,
} from "@/components/agents/profile/agent-profile-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AgentOverviewEntry } from "@/lib/agents/overview";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import { agentProviderMeta } from "@/lib/agents/provider-meta";
import { compactAge } from "@/lib/agents/compact-age";
import { useAgentOverviewEntries } from "@/lib/agents/use-agent-overview";
import { useRepoStore } from "@/lib/repo-store";

export function AgentProfileView({
  path,
  provider,
  entries,
  onOpenThread,
  onSeeAllThreads,
  onOpenChat,
}: {
  path: string;
  provider: NativeAgentProvider;
  entries?: AgentOverviewEntry[];
  onOpenThread: (entry: AgentOverviewEntry) => void;
  onSeeAllThreads: () => void;
  onOpenChat: () => void;
}) {
  const { t, i18n } = useTranslation();
  const branch = useRepoStore((state) => state.repos[path]?.branch);
  const fallbackEntries = useAgentOverviewEntries();
  const sourceEntries = entries ?? fallbackEntries;

  const scoped = useMemo(
    () => sourceEntries.filter((e) => e.path === path || e.basePath === path),
    [sourceEntries, path],
  );
  const stats = useMemo(() => {
    const totalCost = scoped.reduce((s, e) => s + (e.costUsd ?? 0), 0);
    const lifetimeTokens = scoped.reduce((s, e) => s + (e.tokens ?? 0), 0);
    const peakTokens = scoped.reduce((m, e) => Math.max(m, e.tokens ?? 0), 0);
    return {
      totalCost,
      lifetimeTokens,
      peakTokens,
      sessions: scoped.length,
      streakDays: topStreakDays(scoped),
    };
  }, [scoped]);
  const recent = useMemo(() => [...scoped].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5), [scoped]);

  return (
    <ScrollArea className="h-full min-h-0">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6" data-testid="agent-profile-view">
        <AgentProfileCover
          path={path}
          provider={provider}
          branch={branch}
          threadCount={scoped.length}
        />

        <div>
          <h3 className="text-sm font-semibold tracking-tight">{t("agentProfile.workspaceActivity")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("agentProfile.activityHint")}
          </p>
          <div className="mt-3">
            <AgentStatTiles tiles={buildContributionTiles(stats, t)} />
          </div>
        </div>

        <AgentActivityHeatmap entries={scoped} />

        <div className="grid gap-4 lg:grid-cols-2">
          <AgentBarsCard entries={scoped} />
          <AgentTokensCard entries={scoped} />
        </div>

        <Card data-testid="agent-profile-recent">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">{t("agentProfile.recentSessions")}</CardTitle>
            <Button variant="ghost" size="sm" onClick={onSeeAllThreads}>
              {t("agentProfile.seeAll")}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {recent.length === 0 ? (
              <div className="flex flex-col items-start gap-3 py-4">
                <p className="text-sm text-muted-foreground">
                  {t("agentOverview.empty")}
                </p>
                <Button size="sm" onClick={onOpenChat}>
                  {t("agentWorkspace.newSession")}
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </div>
            ) : (
              recent.map((entry) => {
                const meta = agentProviderMeta(entry.provider);
                const Logo = meta.Logo;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => onOpenThread(entry)}
                    className="group flex min-w-0 items-center gap-3 rounded-xl px-2 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                      <Logo className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{entry.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {meta.label} · <span className="tabular-nums">{compactAge(entry.updatedAt, i18n.language)}</span>
                      </span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
