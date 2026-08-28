import { CheckCircle2, CircleDashed, Clock, XCircle } from "lucide-react";
import { RemoteCiCheck } from "./ci-types";
import { PulseIcon } from "@/components/motion/kit";

export function CiCheckIcon({ check }: { check: RemoteCiCheck }) {
  const key = (check.conclusion ?? check.status ?? "").toLowerCase();

  if (["success", "successful", "passed"].includes(key)) {
    return (
      <CheckCircle2 className="h-5 w-5 shrink-0 text-git-added drop-shadow-sm transition-transform group-hover:scale-110" />
    );
  }

  if (
    [
      "failure",
      "failed",
      "timed_out",
      "cancelled",
      "action_required",
      "error",
    ].includes(key)
  ) {
    return (
      <XCircle className="h-5 w-5 shrink-0 text-git-removed drop-shadow-sm transition-transform group-hover:scale-110" />
    );
  }

  if (["in_progress", "queued", "pending", "inprogress"].includes(key)) {
    return (
      <PulseIcon icon={Clock} className="h-5 w-5 shrink-0 text-primary drop-shadow-sm" />
    );
  }

  return (
    <CircleDashed className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:scale-110" />
  );
}
