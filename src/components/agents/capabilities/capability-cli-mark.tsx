import { agentProvider } from "@/lib/agents/provider-registry";
import { cn } from "@/lib/utils";

export function CapabilityCliMark({
  cli,
  label,
  className,
  logoClassName,
}: {
  cli: string;
  label?: string;
  className?: string;
  logoClassName?: string;
}) {
  const meta = agentProvider(cli);
  const Logo = meta?.icon;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {Logo ? (
        <Logo className={cn("size-3.5", logoClassName)} />
      ) : (
        <span className={cn("grid size-3.5 place-items-center rounded-[5px] bg-[var(--ag-surface-3)] text-[8px] font-semibold uppercase", logoClassName)}>
          {cli.slice(0, 1)}
        </span>
      )}
      {label ? <span className="truncate">{label}</span> : null}
    </span>
  );
}
