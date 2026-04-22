import { GitBranch, GitCommit, GitMerge, GitPullRequest, Plus } from "lucide-react";
import { FeatureCard } from "./feature-card";
import { EmptyStateHero } from "./empty-state-hero";
import { EmptyStateHint } from "./empty-state-hint";

export function EmptyState() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-8 animate-in fade-in duration-500">
      <div className="flex flex-col items-center max-w-md w-full gap-8">
        <EmptyStateHero
          icon={
            <>
              <GitBranch className="w-12 h-12" />
              <div className="absolute -bottom-2 -right-2 bg-background rounded-full p-1.5 shadow-lg">
                <Plus className="w-6 h-6 text-git-added" />
              </div>
            </>
          }
          title="Willkommen bei l8git"
          description="Dein lokaler Workspace für nahtlose Git-Workflows."
        />

        <div className="grid grid-cols-2 gap-4 w-full">
          <FeatureCard 
            icon={<GitCommit className="w-8 h-8 text-git-modified" />} 
            label="Commits" 
          />
          <FeatureCard 
            icon={<GitBranch className="w-8 h-8 text-git-branch" />} 
            label="Branches" 
          />
          <FeatureCard 
            icon={<GitMerge className="w-8 h-8 text-git-merge" />} 
            label="Merges" 
          />
          <FeatureCard 
            icon={<GitPullRequest className="w-8 h-8 text-primary" />} 
            label="PRs" 
          />
        </div>

        <EmptyStateHint 
          icon={<Plus className="w-4 h-4" />} 
          text="Klicke oben auf das Plus, um zu starten" 
        />
      </div>
    </div>
  );
}
