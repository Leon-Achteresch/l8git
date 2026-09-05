import { useTranslation } from "react-i18next";

import { agentProviderMeta } from "@/lib/agents/provider-meta";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";

function repoName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function AgentProfileCover({
  path,
  provider,
  branch,
  threadCount,
}: {
  path: string;
  provider: NativeAgentProvider;
  branch?: string | null;
  threadCount: number;
  index?: number;
}) {
  const { t } = useTranslation();
  const meta = agentProviderMeta(provider);
  const Logo = meta.Logo;
  const name = repoName(path);

  return (
    <div className="flex flex-wrap items-end gap-4" data-testid="agent-profile-cover">
      <span className="grid size-12 place-items-center rounded-[var(--ag-r-md)] bg-[var(--ag-surface)]">
        <Logo className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-semibold tracking-[-0.03em]">{name}</h2>
        <p className="mt-0.5 truncate text-[12px] text-[var(--ag-text-3)]">
          {meta.label}
          {branch ? ` · ${branch}` : ""}
          {` · ${t("agentWorkspace.threadCount", { count: threadCount })}`}
        </p>
      </div>
    </div>
  );
}
