import { GitBranch, GitCommitHorizontal, GitMerge, GitPullRequest } from "lucide-react";

import { FeatureCard } from "./feature-card";

export function EmptyState() {
  return (
    <div className="relative isolate flex h-full w-full flex-col items-center justify-center overflow-hidden bg-[#F8F9FA] p-8 animate-in fade-in duration-500">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(15,23,42,0.1)_1px,transparent_1px)] bg-[size:22px_22px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_48%,rgba(255,255,255,0.9)_0%,transparent_70%)]"
      />

      <div className="pointer-events-none absolute left-8 top-[14%]">
        <FeatureCard
          icon={<GitCommitHorizontal className="size-6 text-orange-500" />}
          caption="Alle Änderungen"
          label="Commits"
          iconWellClassName="bg-orange-50"
          floatingPhase={0}
        />
      </div>
      <div className="pointer-events-none absolute right-8 top-[14%]">
        <FeatureCard
          icon={<GitBranch className="size-6 text-teal-500" />}
          caption="Übersichtlich"
          label="Branches"
          iconWellClassName="bg-teal-50"
          floatingPhase={1}
        />
      </div>
      <div className="pointer-events-none absolute bottom-[18%] left-8">
        <FeatureCard
          icon={<GitMerge className="size-6 text-rose-500" />}
          caption="Einfach"
          label="Merges"
          iconWellClassName="bg-rose-50"
          floatingPhase={2}
        />
      </div>
      <div className="pointer-events-none absolute bottom-[18%] right-8">
        <FeatureCard
          icon={<GitPullRequest className="size-6 text-violet-500" />}
          caption="Integriert"
          label="Pull Requests"
          iconWellClassName="bg-violet-50"
          floatingPhase={3}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-5 text-center">
        <h1 className="text-5xl font-bold leading-tight tracking-tight text-slate-900">
          Dein <span className="text-indigo-500">Git</span> Workflow.
          <br />
          Einfach. Lokal. Schnell.
        </h1>
        <p className="max-w-md leading-relaxed text-slate-500">
          l8git gibt dir alle Werkzeuge, um effizient zu arbeiten –
          <br />
          ohne Ablenkung, ohne Cloud, ohne Kompromisse.
        </p>
      </div>

      <div className="absolute bottom-6">
        <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/60 px-4 py-1.5 text-sm text-slate-400 shadow-sm">
          <span>+</span>
          <span>Klicke oben auf das Plus, um zu starten</span>
        </div>
      </div>
    </div>
  );
}
