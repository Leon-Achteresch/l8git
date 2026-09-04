import { open as pickDirectory } from "@tauri-apps/plugin-dialog";
import { FolderGit2, Sparkles } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import { ClaudeCodeLogo, CodexLogo, CursorLogo, OpenCodeLogo } from "@/components/brand/agent-logos";
import { SPRING_PANEL, SPRING_PRESS } from "@/lib/motion/ease";
import { useRepoStore } from "@/lib/repo-store";

export function AgentsEmpty() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
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
    <div className="relative isolate flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-[radial-gradient(820px_360px_at_92%_-8%,color-mix(in_oklab,var(--git-branch)_8%,transparent),transparent_66%),var(--ag-stage-bg)] p-4 text-[var(--ag-text)] sm:p-8">
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="absolute -right-32 -top-36 size-[34rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--git-branch)_17%,transparent)_0%,transparent_68%)] blur-2xl" />
        <div className="absolute bottom-8 left-[8%] h-px w-[42%] bg-gradient-to-r from-transparent via-[var(--ag-line-strong)] to-transparent" />
      </div>

      <AgentsEnter className="relative z-[1] w-full max-w-2xl">
        <m.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={SPRING_PANEL}
          className="rounded-[var(--ag-r-md)] border border-[var(--ag-line)] bg-[var(--ag-surface)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.08)] transition-[transform,border-color,box-shadow] duration-200 hover:border-[var(--ag-line-strong)] grid w-full gap-8 rounded-[var(--ag-r-xl)] border-[var(--ag-line)] bg-[var(--ag-surface)]/90 p-6 text-left shadow-[var(--ag-shadow-panel)] backdrop-blur-xl sm:grid-cols-[auto_minmax(0,1fr)] sm:p-9"
        >
          <div className="relative mx-auto flex items-center justify-center self-start sm:mt-1">
            <m.div
              animate={reduce ? undefined : { rotate: 360 }}
              transition={{ repeat: Infinity, duration: 32, ease: "linear" }}
              className="absolute -inset-4 rounded-[24px] border border-dashed border-[var(--git-branch)]/25"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <span className="grid size-10 place-items-center rounded-[12px] border border-[var(--ag-line)] bg-[var(--ag-surface-2)] shadow-[var(--ag-shadow-raise)]">
                <CodexLogo className="size-5" />
              </span>
              <span className="grid size-10 place-items-center rounded-[12px] border border-[var(--ag-line)] bg-[var(--ag-surface-2)] shadow-[var(--ag-shadow-raise)]">
                <ClaudeCodeLogo className="size-5" />
              </span>
              <span className="grid size-10 place-items-center rounded-[12px] border border-[var(--ag-line)] bg-[var(--ag-surface-2)] shadow-[var(--ag-shadow-raise)]">
                <CursorLogo className="size-5" />
              </span>
              <span className="grid size-10 place-items-center rounded-[12px] border border-[var(--ag-line)] bg-[var(--ag-surface-2)] shadow-[var(--ag-shadow-raise)]">
                <OpenCodeLogo className="size-5" />
              </span>
            </div>
          </div>

          <div className="min-w-0">
            <div className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-[var(--ag-surface-2)] px-2 py-1 text-[10px] font-semibold tracking-[0.04em] text-[var(--git-branch)]">
              <Sparkles className="size-3 shrink-0" />
              <span className="truncate">Agent workspace</span>
            </div>

            <h1 className="mt-4 text-2xl font-semibold tracking-[-0.045em] text-[var(--ag-text)] text-balance">
              {t("agents.noRepos")}
            </h1>
            <p className="text-[var(--ag-text-2)] mt-2 max-w-md text-[13px] leading-5 text-pretty">
              {t("agents.noReposHint")}
            </p>

            <m.button
              type="button"
              whileTap={reduce ? undefined : { scale: 0.97 }}
              transition={SPRING_PRESS}
              onClick={() => void openRepo()}
              className="bg-[var(--ag-solid)] shadow-[0_8px_18px_-12px_color-mix(in_oklab,var(--ag-solid)_70%,transparent)] outline-none transition-[transform,filter,box-shadow] duration-200 hover:brightness-110 active:scale-[0.985] focus-visible:ring-3 focus-visible:ring-[color-mix(in_oklab,var(--git-branch)_16%,transparent)] mt-7 inline-flex h-10 max-w-full items-center gap-2 rounded-[var(--ag-r-md)] px-4 text-[13px] font-semibold text-[var(--ag-solid-fg)]"
            >
              <FolderGit2 className="size-4 shrink-0" />
              <span className="truncate">{t("addRepo.openLocal")}</span>
            </m.button>
          </div>
        </m.div>
      </AgentsEnter>
    </div>
  );
}
