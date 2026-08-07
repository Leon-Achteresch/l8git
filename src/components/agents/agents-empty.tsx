import { open as pickDirectory } from "@tauri-apps/plugin-dialog";
import { FolderGit2, Plus } from "lucide-react";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
    <div className="agents-shell grid h-full place-items-center p-8">
      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_PANEL}
        className="ag-card flex w-full max-w-sm flex-col items-center p-8 text-center shadow-[var(--ag-shadow-panel)]"
      >
        <span className="ag-inset grid size-12 place-items-center rounded-[14px]">
          <FolderGit2 className="ag-muted size-5" />
        </span>
        <p className="mt-5 text-[15px] font-semibold tracking-[-0.015em]">
          {t("agents.noRepos")}
        </p>
        <p className="ag-muted mt-1.5 text-[12px] leading-5">{t("agents.noReposHint")}</p>
        <button
          type="button"
          className="ag-pill mt-6 h-8 px-4"
          data-active="true"
          onClick={() => void openRepo()}
        >
          <Plus className="size-3.5" />
          {t("addRepo.openLocal")}
        </button>
      </m.div>
    </div>
  );
}
