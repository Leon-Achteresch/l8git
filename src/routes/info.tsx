import { createFileRoute, useRouter } from "@tanstack/react-router";
import { formatForDisplay, useHotkeyRegistrations } from "@tanstack/react-hotkeys";
import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/info")({
  component: Info,
});

function Info() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { hotkeys } = useHotkeyRegistrations();

  const rows = useMemo(
    () =>
      [...hotkeys].sort((a, b) => {
        const an = a.options.meta?.name ?? "";
        const bn = b.options.meta?.name ?? "";
        const loc = i18n.resolvedLanguage ?? undefined;
        return (
          an.localeCompare(bn, loc) || String(a.hotkey).localeCompare(String(b.hotkey), loc)
        );
      }),
    [hotkeys, i18n.resolvedLanguage],
  );

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => router.history.back()}
          aria-label={t("info.backAria")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-2xl font-semibold">{t("info.title")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("info.shortcutsTitle")}</CardTitle>
          <CardDescription>{t("info.shortcutsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-lg border text-sm">
            {rows.length === 0 ? (
              <li className="px-3 py-3 text-muted-foreground">
                {t("info.noShortcuts")}
              </li>
            ) : (
              rows.map((reg) => {
                const label = reg.options.meta?.name ?? formatForDisplay(reg.hotkey);
                const active = reg.options.enabled !== false;
                return (
                  <li
                    key={reg.id}
                    className={`flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-baseline sm:justify-between ${
                      active ? "" : "opacity-50"
                    }`}
                  >
                    <span className="font-medium">{label}</span>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums sm:text-right">
                      {formatForDisplay(reg.hotkey)}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("info.moreTitle")}</CardTitle>
          <CardDescription>{t("info.moreDesc")}</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
