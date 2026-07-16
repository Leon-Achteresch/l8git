import { PanelBottom, PanelRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useTerminalStore, type TerminalPosition } from "@/lib/terminal-store";
import { useUiVisibilityPrefs } from "@/lib/ui-visibility-prefs";
import { cn } from "@/lib/utils";

export function InterfaceElementsCard() {
  const { t } = useTranslation();
  const showHeaderIsland = useUiVisibilityPrefs((s) => s.showHeaderIsland);
  const setShowHeaderIsland = useUiVisibilityPrefs((s) => s.setShowHeaderIsland);
  const showAgentDock = useUiVisibilityPrefs((s) => s.showAgentDock);
  const setShowAgentDock = useUiVisibilityPrefs((s) => s.setShowAgentDock);
  const position = useTerminalStore((s) => s.position);
  const setPosition = useTerminalStore((s) => s.setPosition);

  const options: { value: TerminalPosition; label: string; icon: typeof PanelBottom }[] = [
    { value: "bottom", label: t("settings.terminalPositionBottom"), icon: PanelBottom },
    { value: "right", label: t("settings.terminalPositionRight"), icon: PanelRight },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.interfaceElementsTitle")}</CardTitle>
        <CardDescription>{t("settings.interfaceElementsDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start gap-3">
          <Checkbox
            id="ui-header-island"
            checked={showHeaderIsland}
            onCheckedChange={(v) => setShowHeaderIsland(v === true)}
            className="mt-0.5"
          />
          <div className="space-y-1">
            <Label
              htmlFor="ui-header-island"
              className="cursor-pointer text-sm font-medium text-foreground"
            >
              {t("settings.islandLabel")}
            </Label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("settings.islandHint")}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="ui-agent-dock"
            checked={showAgentDock}
            onCheckedChange={(v) => setShowAgentDock(v === true)}
            className="mt-0.5"
          />
          <div className="space-y-1">
            <Label
              htmlFor="ui-agent-dock"
              className="cursor-pointer text-sm font-medium text-foreground"
            >
              {t("settings.dockLabel")}
            </Label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("settings.dockHint")}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">
            {t("settings.terminalPositionLabel")}
          </Label>
          <div className="flex gap-2">
            {options.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setPosition(value)}
                aria-pressed={position === value}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                  position === value
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
