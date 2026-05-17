import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAnimationPrefs } from "@/lib/animation-prefs";
import { useTranslation } from "react-i18next";

export function AnimationsCard() {
  const { t } = useTranslation();
  const enabled = useAnimationPrefs((s) => s.animationsEnabled);
  const setEnabled = useAnimationPrefs((s) => s.setAnimationsEnabled);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("animations.title")}</CardTitle>
        <CardDescription>{t("animations.desc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-3">
          <Checkbox
            id="animations-enabled"
            checked={enabled}
            onCheckedChange={(v) => setEnabled(v === true)}
            className="mt-0.5"
          />
          <div className="space-y-1">
            <Label
              htmlFor="animations-enabled"
              className="cursor-pointer text-sm font-medium text-foreground"
            >
              {t("animations.enableLabel")}
            </Label>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("animations.enableHint")}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
