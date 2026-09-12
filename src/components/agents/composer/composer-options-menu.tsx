import { Check, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { ComposerMenu, ComposerMenuItem, ComposerMenuLabel } from "./composer-menu";
import type { ComposerOption } from "./types";
import { Switch } from "@/components/ui/switch";

export function ComposerOptionsMenu({
  options,
  onChange,
  label = "Options",
}: {
  options: ComposerOption[];
  onChange: (id: string, value: string | boolean) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (options.length === 0) return null;

  const summary =
    options.find(option => option.type === "select" && typeof option.value === "string");
  const summaryLabel =
    summary?.choices.find(choice => choice.value === summary.value)?.label ??
    (typeof summary?.value === "string" ? summary.value : undefined);

  return (
    <ComposerMenu
      open={open}
      onOpenChange={setOpen}
      align="start"
      className="w-72"
      trigger={
        <button
          type="button"
          title={label}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-muted"
        >
          <SlidersHorizontal className="size-4" strokeWidth={1.75} aria-hidden />
          <span className="max-w-32 truncate">{summaryLabel ?? label}</span>
        </button>
      }
    >
      {options.map(option => (
        <div key={option.id}>
          <ComposerMenuLabel>{option.name}</ComposerMenuLabel>
          {option.type === "boolean" ? (
            <ComposerMenuItem
              label={option.description || option.name}
              trailing={
                <Switch
                  checked={option.value === true}
                  onCheckedChange={checked => onChange(option.id, checked)}
                  aria-label={option.name}
                />
              }
              onClick={() => onChange(option.id, option.value !== true)}
            />
          ) : (
            option.choices.map(choice => (
              <ComposerMenuItem
                key={choice.value}
                label={choice.label}
                hint={choice.description}
                selected={choice.value === option.value}
                trailing={choice.value === option.value ? <Check className="size-4" /> : undefined}
                onClick={() => onChange(option.id, choice.value)}
              />
            ))
          )}
        </div>
      ))}
    </ComposerMenu>
  );
}
