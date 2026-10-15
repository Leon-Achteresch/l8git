import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SHELL_LAYOUTS, useWorkspacePrefs } from "@/lib/workspace-prefs";

const PREVIEWS = import.meta.glob<string>("../../assets/shell-layouts/*.webp", {
  eager: true,
  import: "default",
});

const preview = (id: string, theme: "light" | "dark") =>
  PREVIEWS[`../../assets/shell-layouts/${id}-${theme}.webp`];

export function ShellLayoutCard() {
  const { t } = useTranslation();
  const shellLayout = useWorkspacePrefs((s) => s.shellLayout);
  const setShellLayout = useWorkspacePrefs((s) => s.setShellLayout);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("shellLayout.title")}</CardTitle>
        <CardDescription>{t("shellLayout.desc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          role="radiogroup"
          aria-label={t("shellLayout.title")}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          {SHELL_LAYOUTS.map((id) => {
            const active = shellLayout === id;
            const name = t(`shellLayout.layouts.${id}.name`);
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setShellLayout(id)}
                className={cn(
                  "group flex flex-col gap-2 rounded-xl p-2 text-left outline-none ring-1 transition-[box-shadow,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-muted/60 ring-2 ring-foreground"
                    : "ring-border hover:bg-muted/40 hover:ring-foreground/25",
                )}
              >
                <span className="relative block aspect-[16/10] overflow-hidden rounded-lg bg-muted ring-1 ring-border/60">
                  <img
                    src={preview(id, "light")}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover object-left-top dark:hidden"
                  />
                  <img
                    src={preview(id, "dark")}
                    alt=""
                    loading="lazy"
                    className="hidden size-full object-cover object-left-top dark:block"
                  />
                  {active && (
                    <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-foreground text-background shadow-md">
                      <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                    </span>
                  )}
                </span>
                <span className="flex flex-col gap-0.5 px-1 pb-1">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {name}
                    {id === "rail" && (
                      <span className="rounded-full bg-foreground/[0.07] px-1.5 py-px text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("shellLayout.default")}
                      </span>
                    )}
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    {t(`shellLayout.layouts.${id}.desc`)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
