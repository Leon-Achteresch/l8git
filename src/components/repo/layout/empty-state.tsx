import { Button } from "@/components/ui/button";
import { usePickRepo } from "@/lib/use-pick-repo";
import { Download, FolderGit2, GitBranch, GitCommitHorizontal, GitMerge, GitPullRequest, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { CloneRepoDialog } from "@/components/repo/tabs/clone-repo-dialog";
import { InitRepoDialog } from "@/components/repo/tabs/init-repo-dialog";
import { FeatureCard } from "./feature-card";

export function EmptyState() {
  const { t } = useTranslation();
  const pickRepo = usePickRepo();
  const [cloneOpen, setCloneOpen] = useState(false);
  const [initOpen, setInitOpen] = useState(false);

  return (
    <div className="relative isolate flex h-full w-full flex-col items-center justify-center overflow-hidden bg-background p-8 animate-in fade-in duration-500">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,hsl(var(--foreground)/0.06)_1px,transparent_1px)] bg-[size:22px_22px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_48%,hsl(var(--background)/0.92)_0%,transparent_70%)]"
      />

      <div className="pointer-events-none absolute left-8 top-[14%]">
        <FeatureCard
          icon={<GitCommitHorizontal className="size-6 text-orange-500" />}
          caption={t("emptyState.cardCommitsCaption")}
          label={t("emptyState.cardCommitsLabel")}
          iconWellClassName="bg-orange-50 dark:bg-orange-950"
          floatingPhase={0}
        />
      </div>
      <div className="pointer-events-none absolute right-8 top-[14%]">
        <FeatureCard
          icon={<GitBranch className="size-6 text-teal-500" />}
          caption={t("emptyState.cardBranchesCaption")}
          label={t("emptyState.cardBranchesLabel")}
          iconWellClassName="bg-teal-50 dark:bg-teal-950"
          floatingPhase={1}
        />
      </div>
      <div className="pointer-events-none absolute bottom-[18%] left-8">
        <FeatureCard
          icon={<GitMerge className="size-6 text-rose-500" />}
          caption={t("emptyState.cardMergesCaption")}
          label={t("emptyState.cardMergesLabel")}
          iconWellClassName="bg-rose-50 dark:bg-rose-950"
          floatingPhase={2}
        />
      </div>
      <div className="pointer-events-none absolute bottom-[18%] right-8">
        <FeatureCard
          icon={<GitPullRequest className="size-6 text-violet-500" />}
          caption={t("emptyState.cardPrCaption")}
          label={t("emptyState.cardPrLabel")}
          iconWellClassName="bg-violet-50 dark:bg-violet-950"
          floatingPhase={3}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 text-center">
        <h1 className="text-5xl font-bold leading-tight tracking-tight text-foreground">
          {t("emptyState.titleBefore")}{" "}
          <span className="text-indigo-500">Git</span> {t("emptyState.titleAfter")}
          <br />
          {t("emptyState.titleTagline")}
        </h1>
        <p className="max-w-md leading-relaxed text-muted-foreground">
          {t("emptyState.subtitleLine1")}
          <br />
          {t("emptyState.subtitleLine2")}
        </p>

        {/* Primary CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="default"
            className="gap-2"
            onClick={() => void pickRepo()}
          >
            <FolderGit2 className="size-4" />
            {t("emptyState.ctaOpen")}
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setCloneOpen(true)}
          >
            <Download className="size-4" />
            {t("emptyState.ctaClone")}
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setInitOpen(true)}
          >
            <Plus className="size-4" />
            {t("emptyState.ctaInit")}
          </Button>
        </div>
      </div>

      <CloneRepoDialog open={cloneOpen} onClose={() => setCloneOpen(false)} />
      <InitRepoDialog open={initOpen} onClose={() => setInitOpen(false)} />
    </div>
  );
}
