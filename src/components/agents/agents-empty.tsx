import { open as pickDirectory } from "@tauri-apps/plugin-dialog";
import { FolderGit2, Sparkles } from "lucide-react";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import { ClaudeCodeLogo, CodexLogo, CursorLogo, OpenCodeLogo } from "@/components/brand/agent-logos";
import { SPRING_PANEL, SPRING_PRESS } from "@/lib/motion/ease";
import { useRepoStore } from "@/lib/repo-store";

export function AgentsEmpty() {
  const { t } = useTranslation();
  const addRepo = useRepoStore((state) => state.addRepo);

  const openRepo = async () => {
    const picked = await pickDirectory({ directory: true, multiple: false });
    if (typeof picked !== "string") return;
    try {
      await addRepo(picked);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="agents-shell ag-stage relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden p-8">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-35">
        <div className="size-[520px] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--git-branch)_18%,transparent)_0%,transparent_70%)] blur-2xl" />
      </div>

      <AgentsEnter className="relative z-[1] w-full max-w-lg">
        <m.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={SPRING_PANEL}
          className="ag-card flex w-full flex-col items-center rounded-[var(--ag-r-xl)] border-[var(--ag-line)] bg-[var(--ag-surface)]/90 p-10 text-center shadow-[var(--ag-shadow-panel)] backdrop-blur-xl"
        >
          <div className="relative mb-6 flex items-center justify-center">
            <m.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 24, ease: "linear" }}
              className="absolute -inset-3 rounded-full border border-dashed border-[var(--git-branch)]/30"
            />
            <div className="flex -space-x-2">
              <span className="grid size-10 place-items-center rounded-2xl border border-[var(--ag-line)] bg-[var(--ag-surface-2)] shadow-[var(--ag-shadow-raise)]">
                <CodexLogo className="size-5" />
              </span>
              <span className="grid size-10 place-items-center rounded-2xl border border-[var(--ag-line)] bg-[var(--ag-surface-2)] shadow-[var(--ag-shadow-raise)]">
                <ClaudeCodeLogo className="size-5" />
              </span>
              <span className="grid size-10 place-items-center rounded-2xl border border-[var(--ag-line)] bg-[var(--ag-surface-2)] shadow-[var(--ag-shadow-raise)]">
                <CursorLogo className="size-5" />
              </span>
              <span className="grid size-10 place-items-center rounded-2xl border border-[var(--ag-line)] bg-[var(--ag-surface-2)] shadow-[var(--ag-shadow-raise)]">
                <OpenCodeLogo className="size-5" />
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-full border border-[var(--ag-line)] bg-[var(--ag-surface-2)] px-3 py-1 text-[11px] font-medium text-[var(--git-branch)]">
            <Sparkles className="size-3" />
            <span>Autonomous Agent Workspace</span>
          </div>

          <h1 className="mt-4 text-xl font-bold tracking-tight text-[var(--ag-text)]">
            {t("agents.noRepos")}
          </h1>
          <p className="ag-muted mt-2 max-w-sm text-xs leading-relaxed">
            {t("agents.noReposHint")}
          </p>

          <m.button
            type="button"
            whileTap={{ scale: 0.97 }}
            transition={SPRING_PRESS}
            onClick={() => void openRepo()}
            className="ag-pill mt-8 flex h-10 items-center gap-2 rounded-[var(--ag-r-md)] border border-transparent bg-[var(--git-branch)] px-5 text-[13px] font-semibold text-white shadow-[var(--ag-shadow-raise)] hover:brightness-110"
          >
            <FolderGit2 className="size-4" />
            <span>{t("addRepo.openLocal")}</span>
          </m.button>
        </m.div>
      </AgentsEnter>
    </div>
  );
}
