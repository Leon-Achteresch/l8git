import type { ApprovalCardOption } from "@/components/agents/ui/approval-card/types";

export function OptionLabel({ option }: { option: ApprovalCardOption }) {
  return (
    <span className="select-none">
      <span className="block text-sm text-foreground">{option.label}</span>
      {option.description ? (
        <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
          {option.description}
        </span>
      ) : null}
    </span>
  );
}
