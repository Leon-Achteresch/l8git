import { m } from "motion/react";
import { useTranslation } from "react-i18next";

import { SPRING_PANEL } from "@/@lib/ease";
import {
  AGENT_INTEGRATIONS,
  launchAgent,
  useInstalledAgents,
} from "@/lib/agent-integrations";
import { cn } from "@/lib/utils";

export function AgentsLaunchGrid({
  path,
  onLaunched,
}: {
  path: string;
  onLaunched: (tabId: string) => void;
}) {
  const { t } = useTranslation();
  const installed = useInstalledAgents((s) => s.installed);
  const items = AGENT_INTEGRATIONS.filter(
    (i) => !installed || installed.has(i.id),
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-6 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_40%,hsl(var(--foreground)/0.04)_0%,transparent_70%)]"
      />
      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_PANEL}
        className="relative z-10 flex w-full max-w-md flex-col items-center gap-6"
      >
        <div className="text-center">
          <p className="text-sm font-medium tracking-tight">
            {t("agents.noSessionHint")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("agents.pickAgent")}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((integration, i) => (
            <m.button
              key={integration.id}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING_PANEL, delay: i * 0.04 }}
              onClick={() => {
                const tabId = launchAgent(path, integration, {
                  newInstance: true,
                });
                onLaunched(tabId);
              }}
              className={cn(
                "group flex flex-col items-center gap-2.5 rounded-2xl border border-border/50 bg-background/60 px-3 py-4 text-center shadow-sm",
                "transition-[transform,background-color,border-color,box-shadow] duration-200",
                "hover:border-border hover:bg-background hover:shadow-md active:scale-[0.98]",
              )}
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-muted/70 ring-1 ring-border/40 transition-colors group-hover:bg-muted">
                <integration.icon className="size-5" />
              </span>
              <span className="text-[11px] font-medium tracking-tight">
                {integration.label}
              </span>
            </m.button>
          ))}
        </div>
      </m.div>
    </div>
  );
}
