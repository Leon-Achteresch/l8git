import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SpinIcon } from "@/components/motion/kit";

export function CommitInspectHeader({
  title,
  badge,
  actions,
  onRefresh,
  onClose,
  loading,
}: {
  title?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  onRefresh: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const heading = title ?? t("commitInspect.panelTitle");
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-background px-5 py-3">
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="truncate text-sm font-semibold tracking-tight text-foreground">
          {heading}
        </span>
        {badge}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg transition-colors hover:bg-primary/10 hover:text-primary"
          aria-label={t("common.refresh")}
          title={t("common.refresh")}
          onClick={onRefresh}
          disabled={loading}
        >
          <SpinIcon icon={RefreshCw} active={loading}
            className={`h-4 w-4 ${loading ? "text-primary" : ""}`}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg transition-colors hover:bg-muted hover:text-foreground"
          onClick={onClose}
          aria-label={t("dialogs.closeAria")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
