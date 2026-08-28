import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { RemoteCiCheck } from "./ci-types";
import { SpinIcon } from "@/components/motion/kit";

export function RepoCiSummary({ checks }: { checks: RemoteCiCheck[] }) {
  if (!checks || checks.length === 0) return null;

  const passed = checks.filter((c) => c.conclusion === "success").length;
  const failed = checks.filter(
    (c) => c.conclusion === "failure" || c.conclusion === "timed_out"
  ).length;
  const running = checks.filter(
    (c) => c.status === "in_progress" || c.status === "queued"
  ).length;

  return (
    <div className="flex items-center gap-4 px-4 pb-3 text-xs font-medium">
      {passed > 0 && (
        <div className="flex items-center gap-1.5 text-git-added">
          <CheckCircle2 className="h-4 w-4" />
          <span>{passed}</span>
        </div>
      )}
      {failed > 0 && (
        <div className="flex items-center gap-1.5 text-destructive">
          <XCircle className="h-4 w-4" />
          <span>{failed}</span>
        </div>
      )}
      {running > 0 && (
        <div className="flex items-center gap-1.5 text-git-branch">
          <SpinIcon icon={Loader2} className="h-4 w-4" />
          <span>{running}</span>
        </div>
      )}
    </div>
  );
}
