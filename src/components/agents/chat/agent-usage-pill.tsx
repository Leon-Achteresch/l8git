import { Coins } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AnimatedNumber } from "@/components/motion/animated-number";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { estimateCost, formatTokens, formatUsd, modelPrice } from "@/lib/agents/token-cost";
import type { AgentTokenUsage } from "@/lib/agents/types";

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-0.5">
      <span className={muted ? "ag-faint" : undefined}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

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
          className="ag-chip h-5 gap-1 px-1.5 text-[11px]"
          title={t("agentChat.usage.title")}
        >
          <Coins className="size-3 shrink-0" />
          {/* Tokens and cost climb during a turn. Tweening between values
              shows the spend accumulating instead of flickering through
              unrelated numbers. */}
          <AnimatedNumber value={billed} format={formatTokens} />
          {cost ? (
            <span className="tabular-nums">
              · <AnimatedNumber value={cost.totalUsd} format={formatUsd} />
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" sideOffset={8} className="ag-menu w-72 p-3 text-[12px]">
        <div className="ag-label mb-1.5">{t("agentChat.usage.title")}</div>
        <Row label={t("agentChat.usage.input")} value={formatTokens(input)} />
        <Row label={t("agentChat.usage.output")} value={formatTokens(output)} />
        <Row label={t("agentChat.usage.cacheRead")} value={formatTokens(cacheRead)} muted />
        <Row label={t("agentChat.usage.cacheWrite")} value={formatTokens(cacheWrite)} muted />

        {cost ? (
          <>
            <div className="ag-line my-2 border-t" />
            <div className="ag-label mb-1.5">{t("agentChat.usage.cost")}</div>
            <Row label={t("agentChat.usage.input")} value={formatUsd(cost.inputUsd)} />
            <Row label={t("agentChat.usage.output")} value={formatUsd(cost.outputUsd)} />
            <Row label={t("agentChat.usage.cacheRead")} value={formatUsd(cost.cacheReadUsd)} muted />
            <Row label={t("agentChat.usage.cacheWrite")} value={formatUsd(cost.cacheWriteUsd)} muted />
            <div className="ag-line my-1.5 border-t" />
            <Row label={t("agentChat.usage.total")} value={formatUsd(cost.totalUsd)} />
            {cost.cacheSavedUsd > 0 ? (
              <Row
                label={t("agentChat.usage.saved")}
                value={`−${formatUsd(cost.cacheSavedUsd)}`}
                muted
              />
            ) : null}
            <p className="ag-faint mt-2 text-[10px] leading-4">
              {t("agentChat.usage.disclaimer", {
                input: price?.input ?? 0,
                output: price?.output ?? 0,
              })}
            </p>
          </>
        ) : (
          <p className="ag-faint mt-2 text-[10px] leading-4">
            {t("agentChat.usage.noPrice", { model: model ?? "?" })}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
