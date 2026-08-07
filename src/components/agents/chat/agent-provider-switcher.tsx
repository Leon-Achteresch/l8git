import { Check, ChevronsUpDown } from "lucide-react";

import { ClaudeCodeLogo, CodexLogo } from "@/components/brand/agent-logos";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";

const PROVIDERS = [
  { value: "codex", label: "Codex", description: "OpenAI CLI", Logo: CodexLogo },
  { value: "claude", label: "Claude Code", description: "Anthropic CLI", Logo: ClaudeCodeLogo },
] as const;

export function AgentProviderSwitcher({
  provider,
  onProviderChange,
}: {
  provider: NativeAgentProvider;
  onProviderChange: (provider: NativeAgentProvider) => void;
}) {
  const current = PROVIDERS.find((entry) => entry.value === provider) ?? PROVIDERS[0];
  const CurrentLogo = current.Logo;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="ag-row h-9 gap-2.5 px-1.5"
          aria-label={`Agent: ${current.label}`}
        >
          <span className="ag-inset grid size-6 shrink-0 place-items-center rounded-[7px]">
            <CurrentLogo className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--ag-text)]">
            {current.label}
          </span>
          <ChevronsUpDown className="ag-faint size-3.5 shrink-0" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" sideOffset={6} className="ag-menu w-60 p-1.5">
        {PROVIDERS.map(({ value, label, description, Logo }) => (
          <DropdownMenuItem
            key={value}
            className="ag-menu-item focus:bg-[var(--ag-hover)]"
            onClick={() => onProviderChange(value)}
          >
            <span className="ag-inset grid size-7 shrink-0 place-items-center rounded-[8px]">
              <Logo className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium">{label}</span>
              <span className="ag-faint block truncate text-[10px]">{description}</span>
            </span>
            {provider === value ? <Check className="size-3.5 shrink-0" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
