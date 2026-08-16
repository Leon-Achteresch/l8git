import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export function CommitInspectHeader({
  title,
  badge,
  onRefresh,
  onClose,
  loading,
}: {
  title?: string;
  badge?: React.ReactNode;
  onRefresh: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const heading = title ?? t("commitInspect.panelTitle");
  return (
    <div className="flex items-center justify-between gap-2 bg-muted/10 px-4 py-3 backdrop-blur-md">
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold tracking-tight text-foreground/80">
          {heading}
        </span>
        {badge}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full transition-colors hover:bg-primary/10 hover:text-primary"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? "animate-spin text-primary" : ""}`}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full transition-colors hover:bg-muted hover:text-foreground"
          onClick={onClose}
          aria-label={t("dialogs.closeAria")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
