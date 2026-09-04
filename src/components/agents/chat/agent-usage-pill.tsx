import { Coins } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AgentUsageRow } from "@/components/agents/chat/agent-usage-row";
import { AnimatedNumber } from "@/components/motion/animated-number";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  estimateCost,
  formatTokens,
  formatUsd,
  modelPrice,
} from "@/lib/agents/token-cost";
import type { AgentTokenUsage } from "@/lib/agents/types";

export function AgentUsagePill({
  usage,
  model,
}: {
  usage: AgentTokenUsage | null;
  model: string | null;
}) {
  const { t } = useTranslation();
  if (!usage) return null;

  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const billed = input + output + cacheRead + cacheWrite;
  if (!billed) return null;

  const cost = estimateCost(usage, model);
  const price = modelPrice(model);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[12px] text-[var(--ag-text-2)] outline-none transition-[background-color,color,transform] duration-200 hover:bg-[var(--ag-hover)] hover:text-[var(--ag-text)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 h-5 gap-1 px-1.5 text-[11px]"
          title={t("agentChat.usage.title")}
        >
          <Coins className="size-3 shrink-0" />
          <AnimatedNumber value={billed} format={formatTokens} />
          {cost ? (
            <span className="tabular-nums">
              · <AnimatedNumber value={cost.totalUsd} format={formatUsd} />
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        className="overflow-hidden rounded-[var(--ag-r-lg)] border border-[var(--ag-line)] bg-[var(--ag-surface)] shadow-[var(--ag-shadow-pop)] w-72 p-3 text-[12px]"
      >
        <div className="text-[10px] font-medium tracking-[0.02em] text-[var(--ag-text-3)] mb-1.5">{t("agentChat.usage.title")}</div>
        <AgentUsageRow
          label={t("agentChat.usage.input")}
          value={formatTokens(input)}
        />
        <AgentUsageRow
          label={t("agentChat.usage.output")}
          value={formatTokens(output)}
        />
        <AgentUsageRow
          label={t("agentChat.usage.cacheRead")}
          value={formatTokens(cacheRead)}
          muted
        />
        <AgentUsageRow
          label={t("agentChat.usage.cacheWrite")}
          value={formatTokens(cacheWrite)}
          muted
        />

        {cost ? (
          <>
            <div className="border-[var(--ag-line)] my-2 border-t" />
            <div className="text-[10px] font-medium tracking-[0.02em] text-[var(--ag-text-3)] mb-1.5">{t("agentChat.usage.cost")}</div>
            <AgentUsageRow
              label={t("agentChat.usage.input")}
              value={formatUsd(cost.inputUsd)}
            />
            <AgentUsageRow
              label={t("agentChat.usage.output")}
              value={formatUsd(cost.outputUsd)}
            />
            {cost.cacheReadUsd > 0 ? (
              <AgentUsageRow
                label={t("agentChat.usage.cacheRead")}
                value={formatUsd(cost.cacheReadUsd)}
                muted
              />
            ) : null}
            {cost.cacheWriteUsd > 0 ? (
              <AgentUsageRow
                label={t("agentChat.usage.cacheWrite")}
                value={formatUsd(cost.cacheWriteUsd)}
                muted
              />
            ) : null}
          </>
        ) : null}

        {price ? (
          <>
            <div className="border-[var(--ag-line)] my-2 border-t" />
            <div className="text-[var(--ag-text-3)] text-[10px] leading-4">
              {t("agentChat.usage.rates", {
                input: price.input,
                output: price.output,
              })}
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
