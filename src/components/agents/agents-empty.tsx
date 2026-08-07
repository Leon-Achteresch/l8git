import { open as pickDirectory } from "@tauri-apps/plugin-dialog";
import { FolderGit2 } from "lucide-react";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { SPRING_PANEL } from "@/lib/motion/ease";
import { Button } from "@/components/ui/button";
import { useRepoStore } from "@/lib/repo-store";

export function AgentsEmpty() {
  const { t } = useTranslation();
  const addRepo = useRepoStore((s) => s.addRepo);

  const openRepo = async () => {
    const picked = await pickDirectory({ directory: true, multiple: false });
    if (typeof picked !== "string") return;
    try {
      await addRepo(picked);
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,hsl(var(--foreground)/0.05)_1px,transparent_1px)] bg-[size:20px_20px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,hsl(var(--background)/0.92)_0%,transparent_70%)]"
      />
      <m.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING_PANEL}
        className="relative z-10 flex max-w-sm flex-col items-center gap-4 text-center"
      >
        <m.div
          initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ ...SPRING_PANEL, delay: 0.06 }}
          className="flex size-14 items-center justify-center rounded-[18px] bg-gradient-to-br from-foreground/[0.12] to-foreground/[0.04] shadow-sm ring-1 ring-border/50"
        >
          <FolderGit2 className="size-6 text-muted-foreground" />
        </m.div>
        <div className="space-y-1.5">
          <p className="text-[15px] font-semibold tracking-tight text-foreground">
            {t("agents.noRepos")}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("agents.noReposHint")}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="h-9 rounded-full px-5 shadow-sm transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
          onClick={() => void openRepo()}
        >
          {t("addRepo.openLocal")}
        </Button>
      </m.div>
    </div>
  );
}
