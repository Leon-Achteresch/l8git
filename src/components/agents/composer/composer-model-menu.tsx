import { ChevronDown, Search } from "lucide-react";
import { m } from "motion/react";
import { useState } from "react";

import { ComposerEffortPopover } from "./composer-effort-popover";
import { ComposerMenu } from "./composer-menu";
import { DEFAULT_PROVIDERS } from "./defaults";
import { ProviderLogo } from "./provider-logo";
import type { ComposerModel, ComposerProvider } from "./types";
import { Rotate } from "@/components/motion/kit";
import { SPRING_LAYOUT } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export function ComposerModelMenu({
  models,
  providers = DEFAULT_PROVIDERS,
  value,
  effort,
  onChange,
}: {
  models: ComposerModel[];
  providers?: ComposerProvider[];
  value: string;
  effort?: string;
  onChange: (modelId: string, effort?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [providerId, setProviderId] = useState<string | null>(null);

  const active = models.find(m => m.id === value) ?? models[0];
  if (!active) return null;
  const visible = models.filter(
    m =>
      (!providerId || m.providerId === providerId) &&
      m.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const providerOf = (model: ComposerModel) =>
    providers.find(p => p.id === model.providerId);

  return (
    <ComposerMenu
      open={open}
      onOpenChange={setOpen}
      align="end"
      className="w-96 p-0"
      trigger={
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-muted"
        >
          {active.label}
          <Rotate open={open} className="size-3.5">
            <ChevronDown className="size-3.5" strokeWidth={1.75} aria-hidden />
          </Rotate>
        </button>
      }
    >
      <div className="flex max-h-96">
        <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-border/60 py-2">
          {providers.map(provider => (
            <m.button
              key={provider.id}
              type="button"
              title={provider.label}
              aria-label={provider.label}
              aria-pressed={providerId === provider.id}
              onClick={() =>
                setProviderId(id => (id === provider.id ? null : provider.id))
              }
              layout
              transition={SPRING_LAYOUT}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground",
                providerId === provider.id && "bg-muted text-foreground",
              )}
            >
              <ProviderLogo providerId={provider.id} />
            </m.button>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto p-1.5">
          <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-1.5">
            <span className="text-xs font-medium text-muted-foreground">Models</span>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Quick Search"
                aria-label="Search models"
                className="w-24 bg-transparent text-right outline-none placeholder:text-muted-foreground"
              />
              <Search className="size-3.5" aria-hidden />
            </div>
          </div>

          {visible.map(model => {
            const selected = model.id === value;
            const supportsEffort = (model as { supportsEffort?: boolean }).supportsEffort !== false;
            const efforts = supportsEffort ? model.efforts ?? [] : [];
            const activeEffort =
              efforts.length > 0
                ? (selected && effort && efforts.includes(effort)
                    ? effort
                    : efforts[Math.floor(efforts.length / 2)])
                : undefined;
            const provider = providerOf(model);
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => onChange(model.id, activeEffort)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm transition-colors hover:bg-muted",
                  selected && "bg-muted",
                )}
              >
                {provider && <ProviderLogo providerId={provider.id} />}
                <span className="min-w-0 flex-1 truncate font-medium">{model.label}</span>
                {selected && activeEffort && (
                  <ComposerEffortPopover
                    efforts={efforts}
                    value={activeEffort}
                    onChange={next => onChange(model.id, next)}
                  />
                )}
                <span
                  className={cn(
                    "size-3.5 shrink-0 rounded-full border",
                    selected
                      ? "border-primary bg-primary ring-2 ring-inset ring-background"
                      : "border-border",
                  )}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </div>
    </ComposerMenu>
  );
}
