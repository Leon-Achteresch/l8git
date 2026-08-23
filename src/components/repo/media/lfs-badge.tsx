import { Badge } from "@/components/ui/badge";
import { formatBytes, shortOid, type LfsPointerInfo } from "@/lib/media";
import { cn } from "@/lib/utils";
import { Database } from "lucide-react";
import { useTranslation } from "react-i18next";

export function LfsBadge({
  pointer,
  className,
}: {
  pointer: LfsPointerInfo;
  className?: string;
}) {
  const { t } = useTranslation();
  const oid = shortOid(pointer.oid);
  const size = formatBytes(pointer.size);
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Badge variant="info" className="gap-1">
        <Database />
        {t("lfs.badge")}
      </Badge>
      {oid ? (
        <code className="font-mono text-[11px] text-muted-foreground">
          {t("lfs.pointerOid", { oid })}
        </code>
      ) : null}
      {size ? (
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {size}
        </span>
      ) : null}
    </div>
  );
}
