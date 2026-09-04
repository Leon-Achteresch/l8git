import { ArrowRight } from "lucide-react";
import { useMemo } from "react";

import { AgentActivityHeatmap } from "@/components/agents/profile/AgentActivityHeatmap";
import { AgentBarsCard } from "@/components/agents/profile/AgentBarsCard";
import { AgentProfileCover } from "@/components/agents/profile/AgentProfileCover";
import { AgentStatTiles, buildContributionTiles } from "@/components/agents/profile/AgentStatTiles";
import { AgentTokensCard } from "@/components/agents/profile/AgentTokensCard";
import {
  longestTaskLabel,
  topStreakDays,
} from "@/components/agents/profile/agent-profile-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AgentOverviewEntry } from "@/lib/agents/overview";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";
import { agentProviderMeta } from "@/lib/agents/provider-meta";
import { useRepoStore } from "@/lib/repo-store";

function RelativeTime({ timestamp }: { timestamp: number }) {
  const label = useMemo(() => {
    const seconds = Math.round(Date.now() / 1000 - timestamp);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
    return `${Math.round(seconds / 86400)}d ago`;
  }, [timestamp]);
  return <span className="tabular-nums">{label}</span>;
}

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
  entries: AgentOverviewEntry[];
  onOpenThread: (entry: AgentOverviewEntry) => void;
  onSeeAllThreads: () => void;
  onOpenChat: () => void;
}) {
  const branch = useRepoStore((state) => state.repos[path]?.branch);
  const scoped = useMemo(
    () => entries.filter((e) => e.path === path || e.basePath === path),
    [entries, path],
  );
  const stats = useMemo(() => {
    const totalCost = scoped.reduce((s, e) => s + (e.costUsd ?? 0), 0);
    const lifetimeTokens = scoped.reduce((s, e) => s + (e.tokens ?? 0), 0);
    const peakTokens = scoped.reduce((m, e) => Math.max(m, e.tokens ?? 0), 0);
    return {
      totalCost,
      lifetimeTokens,
      peakTokens,
      longestTask: longestTaskLabel(scoped),
      streakDays: topStreakDays(scoped),
    };
  }, [scoped]);
  const recent = useMemo(() => scoped.slice(0, 5), [scoped]);

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
          <h3 className="text-sm font-semibold tracking-tight">Contributions this year</h3>
          <p className="text-xs text-muted-foreground">
            Live workspace stats — same thread ledger the chat and overview read from.
          </p>
          <div className="mt-3">
            <AgentStatTiles tiles={buildContributionTiles(stats)} />
          </div>
        </div>

        <AgentActivityHeatmap entries={scoped} />

        <div className="grid gap-4 lg:grid-cols-2">
          <AgentBarsCard entries={scoped} />
          <AgentTokensCard entries={scoped} />
        </div>

        <Card data-testid="agent-profile-recent">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">Recent threads</CardTitle>
            <Button variant="ghost" size="sm" onClick={onSeeAllThreads}>
              See all
              <ArrowRight data-icon="inline-end" />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {recent.length === 0 ? (
              <div className="flex flex-col items-start gap-3 py-4">
                <p className="text-sm text-muted-foreground">
                  No threads in this workspace yet. Start the first conversation.
                </p>
                <Button size="sm" onClick={onOpenChat}>
                  New chat
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
                    className="group flex min-w-0 items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                      <Logo className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{entry.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {meta.label} · <RelativeTime timestamp={entry.updatedAt} />
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
