import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CiCheckRow } from "./ci-check-row";
import { RemoteCiCheck } from "./ci-types";

export type { RemoteCiCheck };

export function CiChecksList({
  checks,
  loading,
  emptyLabel,
}: {
  checks: RemoteCiCheck[] | null;
  loading: boolean;
  emptyLabel?: string;
}) {
  const { t } = useTranslation();
  if (loading && !checks) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
      </div>
    );
  }

  if (!checks || checks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm font-medium text-muted-foreground/70">
        {emptyLabel ?? t("ci.noChecks")}
      </div>
    );
  }

  return (
    <ScrollArea className="h-full px-2 py-2">
      <div className="flex flex-col gap-1">
        {checks.map((c, i) => {
          const keyId = `${c.check_run_id ?? ""}-${c.external_id ?? ""}-${c.name}-${c.key ?? ""}-${i}`;
          return <CiCheckRow key={keyId} check={c} />;
        })}
      </div>
    </ScrollArea>
  );
}
