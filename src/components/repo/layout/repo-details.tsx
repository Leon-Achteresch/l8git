import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { CommitHistoryPanel } from "@/components/repo/commit/commit-history-panel";
import { RepoRemoteToolbar } from "@/components/repo/remote/repo-remote-toolbar";
import { useRepoStore } from "@/lib/repo-store";
import { SpinIcon } from "@/components/motion/kit";

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
      <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <SpinIcon icon={Loader2} className="h-4 w-4" />
        {t("repoDetails.loading")}
      </p>
    );
  }

  return null;
}
