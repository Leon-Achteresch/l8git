import { createFileRoute, useRouter } from "@tanstack/react-router";
import { formatForDisplay } from "@tanstack/react-hotkeys";
import { ArrowLeft, Keyboard } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { WorkflowHelpCenter } from "@/components/help/workflow-help-center";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  HOTKEY_ACTIONS,
  HOTKEY_ACTION_GROUPS,
  useHotkeyBindings,
} from "@/lib/hotkey-prefs";

export const Route = createFileRoute("/info")({
  component: Info,
});

function Info() {
  const { t } = useTranslation();
  const router = useRouter();
  const bindings = useHotkeyBindings();

  const groups = useMemo(
    () =>
      HOTKEY_ACTION_GROUPS.map((group) => ({
        id: group,
        label: t(`hotkeys.group.${group}`),
        rows: HOTKEY_ACTIONS.filter((action) => action.group === group).map(
          (action) => ({
            id: action.id,
            label: t(action.labelKey, action.labelParams ?? {}),
            combo: formatForDisplay(bindings[action.id]),
          }),
        ),
      })).filter((group) => group.rows.length > 0),
    [bindings, t],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
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
        <div>
          <h1 className="text-2xl font-semibold">{t("helpCenter.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("helpCenter.subtitle")}</p>
        </div>
      </div>

      <WorkflowHelpCenter />

      <details className="group rounded-xl border">
        <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"><Keyboard className="size-4" />{t("info.shortcutsTitle")}</summary>
      <Card>
        <CardHeader>
          <CardTitle>{t("info.shortcutsTitle")}</CardTitle>
          <CardDescription>
            {t("info.shortcutsDesc")} {t("info.shortcutsCustomizeDesc")}
          </CardDescription>
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void router.navigate({ to: "/settings", hash: "hotkeys" });
              }}
            >
              <Keyboard className="size-3.5" />
              {t("info.shortcutsCustomize")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-5">
          {groups.length === 0 ? (
            <p className="text-muted-foreground">{t("info.noShortcuts")}</p>
          ) : (
            groups.map((group) => (
              <section key={group.id}>
                <h2 className="mb-2 text-[0.65625rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {group.label}
                </h2>
                <ul className="divide-y rounded-2xl border text-sm">
                  {group.rows.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-baseline sm:justify-between"
                    >
                      <span className="font-medium">{row.label}</span>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums sm:text-right">
                        {row.combo}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </CardContent>
      </Card>
      </details>
    </div>
  );
}
