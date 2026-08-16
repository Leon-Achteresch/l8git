import { Button } from "@/components/ui/button";
import { useBranchCleanupPrefs } from "@/lib/branch-cleanup-prefs";
import { useBranchCleanupStore } from "@/lib/branch-cleanup-store";
import { cn } from "@/lib/utils";
import { Brush } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BranchCleanupDialog } from "./branch-cleanup-dialog";

export function BranchCleanupButton({ path, className }: { path: string; className?: string }) {
  const { t } = useTranslation();
  const staleDays = useBranchCleanupPrefs((s) => s.staleDays);
  const hintOnRepoOpen = useBranchCleanupPrefs((s) => s.hintOnRepoOpen);
  const load = useBranchCleanupStore((s) => s.load);
  const count = useBranchCleanupStore((s) => s.candidates[path]?.length ?? 0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hintOnRepoOpen || !path) return;
    void load(path, staleDays);
  }, [hintOnRepoOpen, path, staleDays, load]);

  const showBadge = hintOnRepoOpen && count > 0;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className={cn("gap-1.5 text-muted-foreground hover:text-foreground", className)}
        title={t("branchCleanup.buttonTitle")}
        onClick={() => setOpen(true)}
      >
        <Brush className="h-3 w-3" aria-hidden />
        <span className="truncate">{t("branchCleanup.buttonLabel")}</span>
        {showBadge ? (
          <span
            className="flex h-[16px] min-w-[16px] items-center justify-center rounded-md bg-git-modified/15 px-1 text-[10px] font-semibold tabular-nums text-git-modified"
            aria-label={t("branchCleanup.badgeAria", { count })}
          >
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </Button>
      <BranchCleanupDialog open={open} onClose={() => setOpen(false)} path={path} />
    </>
  );
}
