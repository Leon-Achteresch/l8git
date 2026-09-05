import { open as pickDirectory } from "@tauri-apps/plugin-dialog";
import { FolderGit2 } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useRef, useState } from "react";

import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import { ClaudeCodeLogo, CodexLogo, CursorLogo, OpenCodeLogo } from "@/components/brand/agent-logos";
import { SPRING_PANEL, SPRING_PRESS } from "@/lib/motion/ease";
import { useRepoStore } from "@/lib/repo-store";

export function AgentsEmpty() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const addRepo = useRepoStore((state) => state.addRepo);
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);

  const openRepo = async () => {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    try {
      const picked = await pickDirectory({ directory: true, multiple: false });
      if (typeof picked !== "string") return;
      await addRepo(picked);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full items-center justify-center bg-[var(--ag-canvas)] p-6 text-[var(--ag-text)]">
      <AgentsEnter className="w-full max-w-lg">
        <m.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_PANEL}
          className="flex flex-col gap-6"
        >
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-[var(--ag-r-sm)] bg-[var(--ag-surface)]">
              <CodexLogo className="size-4" />
            </span>
            <span className="grid size-9 place-items-center rounded-[var(--ag-r-sm)] bg-[var(--ag-surface)]">
              <ClaudeCodeLogo className="size-4" />
            </span>
            <span className="grid size-9 place-items-center rounded-[var(--ag-r-sm)] bg-[var(--ag-surface)]">
              <CursorLogo className="size-4" />
            </span>
            <span className="grid size-9 place-items-center rounded-[var(--ag-r-sm)] bg-[var(--ag-surface)]">
              <OpenCodeLogo className="size-4" />
            </span>
          </div>

          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-[-0.045em] text-balance">
              {t("agents.noRepos")}
            </h1>
            <p className="mt-2 max-w-md text-[13px] leading-5 text-[var(--ag-text-2)] text-pretty">
              {t("agents.noReposHint")}
            </p>
            <m.button
              type="button"
              disabled={opening}
              aria-busy={opening}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              transition={SPRING_PRESS}
              onClick={() => void openRepo()}
              className="mt-6 inline-flex h-10 items-center gap-2 rounded-[var(--ag-r-sm)] bg-[var(--ag-solid)] px-4 text-[13px] font-semibold text-[var(--ag-solid-fg)] outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring"
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
