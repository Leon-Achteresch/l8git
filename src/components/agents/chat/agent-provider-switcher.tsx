import { Check, ChevronDown } from "lucide-react";

import { ClaudeCodeLogo, CodexLogo } from "@/components/brand/agent-logos";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NativeAgentProvider } from "@/lib/agents/provider-store";

export function AgentProviderSwitcher({
  provider,
  onProviderChange,
}: {
  provider: NativeAgentProvider;
  onProviderChange: (provider: NativeAgentProvider) => void;
}) {
  const ProviderLogo = provider === "claude" ? ClaudeCodeLogo : CodexLogo;
  const providerLabel = provider === "claude" ? "Claude Code" : "Codex";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left outline-none transition-colors hover:bg-foreground/[0.045] focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Agent provider: ${providerLabel}`}
        >
          <span className="agents-accent-surface grid size-7 shrink-0 place-items-center rounded-[9px]">
            <ProviderLogo className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold tracking-[-0.015em]">
              {providerLabel}
            </span>
            <span className="block truncate text-[9px] text-muted-foreground">
              Native CLI agent
            </span>
          </span>
          <ChevronDown className="size-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 rounded-xl p-1.5">
        {([
          ["codex", "Codex", "OpenAI CLI", CodexLogo],
          ["claude", "Claude Code", "Anthropic CLI", ClaudeCodeLogo],
        ] as const).map(([value, label, description, Logo]) => (
          <DropdownMenuItem
            key={value}
            className="rounded-lg py-2"
            onClick={() => onProviderChange(value)}
          >
            <span className="grid size-7 place-items-center rounded-lg bg-foreground/[0.05]">
              <Logo className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium">{label}</span>
              <span className="block text-[9px] text-muted-foreground">{description}</span>
            </span>
            {provider === value ? <Check className="agents-accent-text size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
