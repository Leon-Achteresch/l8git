import { FolderGit2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export function AgentsEmpty() {
  const { t } = useTranslation();

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,hsl(var(--foreground)/0.05)_1px,transparent_1px)] bg-[size:20px_20px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,hsl(var(--background)/0.9)_0%,transparent_70%)]"
      />
      <div className="relative z-10 flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-muted/60 ring-1 ring-border/50">
          <FolderGit2 className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium tracking-tight text-foreground">
          {t("agents.noRepos")}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("agents.noReposHint")}
        </p>
      </div>
    </div>
  );
}
