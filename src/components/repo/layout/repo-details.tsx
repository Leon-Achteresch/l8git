import { useTranslation } from "react-i18next";

import { CommitHistoryPanel } from "@/components/repo/commit/commit-history-panel";
import { RepoRemoteToolbar } from "@/components/repo/remote/repo-remote-toolbar";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useRepoStore } from "@/lib/repo-store";

export function RepoDetails() {
  const { t } = useTranslation();
  const activePath = useRepoStore((s) => s.activePath);
  const repo = useRepoStore((s) => (activePath ? s.repos[activePath] : null));
  const loading = useRepoStore((s) =>
    activePath ? !!s.loading[activePath] : false,
  );

  if (repo) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <RepoRemoteToolbar path={repo.path} />
        <div className="mx-4 mb-3 min-h-0 flex-1 overflow-hidden rounded-2xl bg-card ring-1 ring-border/50">
          <CommitHistoryPanel path={repo.path} commits={repo.commits} />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={t("repoDetails.loading")}
        className="mx-4 mb-3 min-h-0 flex-1 overflow-hidden rounded-2xl bg-card p-4 ring-1 ring-border/50"
      >
        <SkeletonRows rows={8} />
        <span className="sr-only">{t("repoDetails.loading")}</span>
      </div>
    );
  }

  return null;
}
