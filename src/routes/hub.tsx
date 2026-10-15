import { createFileRoute } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";

import { useHubNav, type HubView } from "@/components/hub/hub-bits";
import { HubConnectDialog } from "@/components/hub/hub-connect-dialog";
import { HubRepoPage } from "@/components/hub/hub-repo";
import { HubSidebar } from "@/components/hub/hub-sidebar";
import { HomeView, HubWelcome, InboxView, PullsView, ReposView } from "@/components/hub/hub-views";
import { PullRequestInspectDetail } from "@/components/repo/pr/pull-request-inspect-detail";
import { accountKey, hubRepoPath, useActiveAccount, useHubStore } from "@/lib/hub/store";
import { useHubQuery } from "@/lib/hub/use-hub-query";

const VIEWS: HubView[] = ["home", "inbox", "prs", "reviews", "starred", "repos", "repo", "pr"];

export const Route = createFileRoute("/hub")({
  validateSearch: (s: Record<string, unknown>): { view?: HubView; repo?: string; pr?: number } => ({
    view: VIEWS.includes(s.view as HubView) ? (s.view as HubView) : undefined,
    repo: typeof s.repo === "string" && s.repo.includes("/") ? s.repo : undefined,
    pr: Number.isInteger(s.pr) && (s.pr as number) > 0 ? (s.pr as number) : undefined,
  }),
  component: HubPage,
});

// Warm amber for stars/highlights, matching the reference look.
const ROOT_STYLE = { "--hub-accent": "oklch(0.76 0.15 65)" } as CSSProperties;

function HubPage() {
  const { view = "home", repo, pr } = Route.useSearch();
  const nav = useHubNav();
  const refresh = useHubStore((s) => s.refresh);
  const account = useActiveAccount();
  const [connecting, setConnecting] = useState(false);
  const sidebar = useHubQuery(account, "sidebar", (ad, a) => ad.sidebar(a));

  return (
    <div className="flex h-full min-h-0" style={ROOT_STYLE}>
      {account ? (
        <>
          <HubSidebar account={account} view={view} repo={repo} sidebar={sidebar} onConnect={() => setConnecting(true)} />
          <main className="min-w-0 flex-1 overflow-y-auto">
            {view === "pr" && repo && pr ? (
              <PullRequestInspectDetail
                key={`${accountKey(account)}/${repo}#${pr}`}
                path={hubRepoPath(account, repo)}
                number={pr}
                onClose={() => nav("repo", repo)}
                onMutated={refresh}
              />
            ) : view === "repo" && repo ? (
              <HubRepoPage key={`${account.login}@${account.host}/${repo}`} account={account} fullName={repo} />
            ) : view === "prs" || view === "reviews" ? (
              <PullsView key={view} account={account} initial={view === "reviews" ? "review" : "authored"} />
            ) : view === "starred" || view === "repos" ? (
              <ReposView key={view} account={account} starred={view === "starred"} />
            ) : view === "inbox" ? (
              <InboxView account={account} />
            ) : (
              <HomeView account={account} sidebar={sidebar} />
            )}
          </main>
        </>
      ) : (
        <main className="flex-1">
          <HubWelcome onConnect={() => setConnecting(true)} />
        </main>
      )}
      <HubConnectDialog open={connecting} onOpenChange={setConnecting} />
    </div>
  );
}
