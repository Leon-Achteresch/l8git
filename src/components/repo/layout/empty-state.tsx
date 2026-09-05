import { Button } from "@/components/ui/button";
import { usePickRepo } from "@/lib/use-pick-repo";
import { Download, FolderGit2, GitBranch, GitCommitHorizontal, GitMerge, GitPullRequest, Plus } from "lucide-react";
import { useState } from "react";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";

import { RepoSourceDialogs } from "@/components/repo/tabs/repo-source-dialogs";
import { WelcomePanel } from "@/components/onboarding/welcome-panel";
import { useOnboardingPrefs } from "@/lib/onboarding-prefs";
import { FeatureCard } from "./feature-card";

export function EmptyState() {
  const { t } = useTranslation();
  const pickRepo = usePickRepo();
  const [cloneOpen, setCloneOpen] = useState(false);
  const [initOpen, setInitOpen] = useState(false);
  const welcomeDismissed = useOnboardingPrefs((s) => s.welcomeDismissed);

  return (
    <m.div
      className="relative isolate flex h-full w-full flex-col items-center justify-center overflow-hidden bg-background p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,hsl(var(--foreground)/0.06)_1px,transparent_1px)] bg-[size:22px_22px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_48%,hsl(var(--background)/0.92)_0%,transparent_70%)]"
      />

      <div className="pointer-events-none absolute left-8 top-[14%] hidden lg:block" aria-hidden>
        <FeatureCard
          icon={<GitCommitHorizontal className="size-6 text-git-modified" />}
          caption={t("emptyState.cardCommitsCaption")}
          label={t("emptyState.cardCommitsLabel")}
          iconWellClassName="bg-git-modified"
          floatingPhase={0}
        />
      </div>
      <div className="pointer-events-none absolute right-8 top-[14%] hidden lg:block" aria-hidden>
        <FeatureCard
          icon={<GitBranch className="size-6 text-git-added" />}
          caption={t("emptyState.cardBranchesCaption")}
          label={t("emptyState.cardBranchesLabel")}
          iconWellClassName="bg-git-added"
          floatingPhase={1}
        />
      </div>
      <div className="pointer-events-none absolute bottom-[18%] left-8 hidden lg:block" aria-hidden>
        <FeatureCard
          icon={<GitMerge className="size-6 text-git-removed" />}
          caption={t("emptyState.cardMergesCaption")}
          label={t("emptyState.cardMergesLabel")}
          iconWellClassName="bg-git-removed"
          floatingPhase={2}
        />
      </div>
      <div className="pointer-events-none absolute bottom-[18%] right-8 hidden lg:block" aria-hidden>
        <FeatureCard
          icon={<GitPullRequest className="size-6 text-git-merge" />}
          caption={t("emptyState.cardPrCaption")}
          label={t("emptyState.cardPrLabel")}
          iconWellClassName="bg-git-merge"
          floatingPhase={3}
        />
      </div>

      <div className="relative z-10 flex max-w-2xl flex-col items-center gap-6 px-4 text-center">
        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-balance text-foreground sm:text-5xl">
          {t("emptyState.titleBefore")}{" "}
          <span className="text-git-branch">Git</span> {t("emptyState.titleAfter")}
          <br />
          {t("emptyState.titleTagline")}
        </h1>
        <p className="max-w-md leading-relaxed text-muted-foreground">
          {t("emptyState.subtitleLine1")}
          <br />
          {t("emptyState.subtitleLine2")}
        </p>

        {!welcomeDismissed && <WelcomePanel onOpenRepo={() => void pickRepo()} />}

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

      <RepoSourceDialogs
        cloneOpen={cloneOpen}
        initOpen={initOpen}
        onCloseClone={() => setCloneOpen(false)}
        onCloseInit={() => setInitOpen(false)}
      />
    </m.div>
  );
}
