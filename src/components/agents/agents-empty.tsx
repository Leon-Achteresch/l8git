import { open as pickDirectory } from "@tauri-apps/plugin-dialog";
import { FolderGit2, Plus } from "lucide-react";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AgentsEnter } from "@/components/agents/ui/agents-enter";
import { SPRING_PANEL } from "@/lib/motion/ease";
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
    <div className="agents-shell ag-stage grid h-full place-items-center p-8">
      <AgentsEnter>
        <m.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={SPRING_PANEL}
          className="ag-card flex w-full max-w-sm flex-col items-center p-8 text-center shadow-[var(--ag-shadow-panel)]"
        >
          <m.span
            className="ag-inset grid size-12 place-items-center rounded-[14px]"
            animate={{ y: [0, -3, 0] }}
            transition={{ repeat: Infinity, duration: 4.2, ease: "easeInOut" }}
          >
            <FolderGit2 className="ag-muted size-5" />
          </m.span>
          <p className="mt-5 text-[15px] font-semibold tracking-[-0.015em]">
            {t("agents.noRepos")}
          </p>
          <p className="ag-muted mt-1.5 text-[12px] leading-5">{t("agents.noReposHint")}</p>
          <m.button
            type="button"
            className="ag-pill mt-6 h-8 px-4"
            data-active="true"
            whileTap={{ scale: 0.96 }}
            onClick={() => void openRepo()}
          >
            <Plus className="size-3.5" />
            {t("addRepo.openLocal")}
          </m.button>
        </m.div>
      </AgentsEnter>
    </div>
  );
}
