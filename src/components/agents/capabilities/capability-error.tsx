import { AlertCircle } from "lucide-react";

export function CapabilityError({ message }: { message: string }) {
  return (
    <div className="m-3 flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/[0.06] px-3.5 py-3 text-xs text-destructive">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 break-words leading-5 font-medium">{message}</span>
    </div>
  );
}
