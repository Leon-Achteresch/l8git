import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { MAX_STALE_DAYS, MIN_STALE_DAYS } from "@/lib/branch-cleanup";
import { useBranchCleanupPrefs } from "@/lib/branch-cleanup-prefs";
import { useTranslation } from "react-i18next";

export function BranchCleanupCard() {
  const { t } = useTranslation();
  const staleDays = useBranchCleanupPrefs((s) => s.staleDays);
  const setStaleDays = useBranchCleanupPrefs((s) => s.setStaleDays);
  const hintOnRepoOpen = useBranchCleanupPrefs((s) => s.hintOnRepoOpen);
  const setHintOnRepoOpen = useBranchCleanupPrefs((s) => s.setHintOnRepoOpen);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("branchCleanup.settingsTitle")}</CardTitle>
        <CardDescription>{t("branchCleanup.settingsDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-foreground">
              {t("branchCleanup.staleDaysLabel")}
            </Label>
            <span className="tabular-nums text-sm font-semibold text-foreground">
              {t("branchCleanup.daysValue", { count: staleDays })}
            </span>
          </div>
          <Slider
            aria-label={t("branchCleanup.staleDaysLabel")}
            min={MIN_STALE_DAYS}
            max={MAX_STALE_DAYS}
            step={1}
            value={[staleDays]}
            onValueChange={([value]: number[]) => setStaleDays(value)}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("branchCleanup.staleDaysHint")}
          </p>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="branch-cleanup-hint"
            checked={hintOnRepoOpen}
            onCheckedChange={(v) => setHintOnRepoOpen(v === true)}
            className="mt-0.5"
          />
          <div className="space-y-1">
            <Label
              htmlFor="branch-cleanup-hint"
              className="cursor-pointer text-sm font-medium text-foreground"
            >
              {t("branchCleanup.hintLabel")}
            </Label>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("branchCleanup.hintHint")}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
