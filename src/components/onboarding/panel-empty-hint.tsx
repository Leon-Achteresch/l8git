import { Button } from "@/components/ui/button";
import { useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export function PanelEmptyHint({
  hint,
  settingsHash,
  actionLabel,
}: {
  hint: string;
  settingsHash?: string;
  actionLabel?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <span className="flex max-w-[280px] flex-col items-center gap-0.5 text-xs text-muted-foreground/80">
      <span className="text-balance">{hint}</span>
      {settingsHash && (
        <Button
          type="button"
          variant="link"
          size="xs"
          onClick={() => void router.navigate({ to: "/settings", hash: settingsHash })}
        >
          {actionLabel ?? t("appSearch.actionSettings")}
        </Button>
      )}
    </span>
  );
}
