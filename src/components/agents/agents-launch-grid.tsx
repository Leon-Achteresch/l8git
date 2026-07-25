import { m } from "motion/react";
import { useTranslation } from "react-i18next";

import { SPRING_PANEL, SPRING_PRESS } from "@/@lib/ease";
import {
  AGENT_INTEGRATIONS,
  launchAgent,
  useInstalledAgents,
} from "@/lib/agent-integrations";
import { cn } from "@/lib/utils";

const AGENT_TINT: Record<string, string> = {
  claude: "from-orange-300 via-amber-200 to-rose-200",
  codex: "from-slate-300 via-zinc-200 to-stone-200",
  gemini: "from-sky-300 via-indigo-200 to-violet-200",
  cursor: "from-neutral-300 via-stone-200 to-zinc-200",
  opencode: "from-emerald-300 via-teal-200 to-cyan-200",
  copilot: "from-violet-300 via-fuchsia-200 to-purple-200",
};

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
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_35%,hsl(var(--foreground)/0.05)_0%,transparent_70%)]"
      />
      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_PANEL}
        className="relative z-10 flex w-full max-w-xl flex-col items-center gap-7"
      >
        <div className="text-center">
          <p className="text-[15px] font-semibold tracking-tight">
            {t("agents.noSessionHint")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("agents.pickAgent")}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((integration, i) => (
            <m.button
              key={integration.id}
              type="button"
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...SPRING_PANEL, delay: i * 0.045 }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.975 }}
              onClick={() => {
                const tabId = launchAgent(path, integration, {
                  newInstance: true,
                });
                onLaunched(tabId);
              }}
              className={cn(
                "group overflow-hidden rounded-2xl bg-card text-left shadow-sm ring-1 ring-border/50",
                "transition-shadow duration-300 hover:shadow-lg hover:ring-border",
              )}
            >
              <span
                className={cn(
                  "relative flex h-14 items-end bg-gradient-to-br px-3 pb-2 opacity-90 transition-opacity duration-300 group-hover:opacity-100 dark:opacity-45 dark:group-hover:opacity-70",
                  AGENT_TINT[integration.id] ??
                    "from-zinc-300 via-neutral-200 to-stone-200",
                )}
              >
                <m.span
                  className="flex size-9 items-center justify-center rounded-xl bg-card/95 shadow-sm ring-1 ring-black/[0.06] backdrop-blur-sm"
                  whileHover={{ rotate: -6 }}
                  transition={SPRING_PRESS}
                >
                  <integration.icon className="size-4.5" />
                </m.span>
              </span>
              <span className="flex flex-col gap-0.5 px-3 py-2.5">
                <span className="truncate text-[12px] font-semibold tracking-tight">
                  {integration.label}
                </span>
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {integration.command}
                </span>
              </span>
            </m.button>
          ))}
        </div>
      </m.div>
    </div>
  );
}
