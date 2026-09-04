import { Button } from "@/components/ui/button";
import { useOnboardingPrefs } from "@/lib/onboarding-prefs";
import { FolderGit2, GitPullRequest, Layers, Sparkles, Undo2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const HIGHLIGHTS = [
  { key: "multiRepo", icon: Layers },
  { key: "rebaseUndo", icon: Undo2 },
  { key: "prCi", icon: GitPullRequest },
  { key: "agents", icon: Sparkles },
] as const;

export function WelcomePanel({ onOpenRepo }: { onOpenRepo: () => void }) {
  const { t } = useTranslation();
  const dismissWelcome = useOnboardingPrefs((s) => s.dismissWelcome);

  return (
    <section
      aria-label={t("welcome.title")}
      className="relative w-full max-w-xl rounded-2xl border border-border/60 bg-card/80 p-5 text-left shadow-md backdrop-blur-sm"
    >
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute top-2 right-2"
            aria-label={t("welcome.dismiss")}
            onClick={dismissWelcome}
          >
            <X aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">{t("welcome.dismiss")}</TooltipContent>
      </Tooltip>

      <p className="text-sm font-semibold tracking-tight text-foreground">{t("welcome.title")}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("welcome.subtitle")}</p>

      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {HIGHLIGHTS.map(({ key, icon: Icon }) => (
          <li key={key} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground ring-1 ring-border/40">
              <Icon className="size-3.5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-medium text-foreground">
                {t(`welcome.${key}Title`)}
              </span>
              <span className="block text-xs leading-snug text-muted-foreground">
                {t(`welcome.${key}Body`)}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          className="gap-2"
          onClick={() => {
            dismissWelcome();
            onOpenRepo();
          }}
        >
          <FolderGit2 className="size-4" aria-hidden />
          {t("welcome.ctaOpen")}
        </Button>
        <span className="text-xs text-muted-foreground">{t("welcome.ctaHint")}</span>
      </div>
    </section>
  );
}
