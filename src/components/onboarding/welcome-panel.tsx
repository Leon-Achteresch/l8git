import { Button } from "@/components/ui/button";
import { useOnboardingPrefs } from "@/lib/onboarding-prefs";
import { FolderGit2, GitPullRequest, Layers, Sparkles, Undo2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

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
    <div className="relative w-full max-w-xl rounded-2xl border border-border/60 bg-card/70 p-5 text-left shadow-lg backdrop-blur-sm">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="absolute right-2 top-2"
        aria-label={t("welcome.dismiss")}
        title={t("welcome.dismiss")}
        onClick={dismissWelcome}
      >
        <X />
      </Button>

      <p className="text-sm font-semibold text-foreground">{t("welcome.title")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("welcome.subtitle")}</p>

      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {HIGHLIGHTS.map(({ key, icon: Icon }) => (
          <li key={key} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground">
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-medium text-foreground">
                {t(`welcome.${key}Title`)}
              </span>
              <span className="block text-[11px] leading-snug text-muted-foreground">
                {t(`welcome.${key}Body`)}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center gap-2">
        <Button
          type="button"
          className="gap-2"
          onClick={() => {
            dismissWelcome();
            onOpenRepo();
          }}
        >
          <FolderGit2 className="size-4" />
          {t("welcome.ctaOpen")}
        </Button>
        <span className="text-[11px] text-muted-foreground">{t("welcome.ctaHint")}</span>
      </div>
    </div>
  );
}
