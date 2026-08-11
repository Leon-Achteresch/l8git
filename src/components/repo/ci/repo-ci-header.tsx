import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CiMode } from "./repo-ci-panel";

export function RepoCiHeader({
  headSha,
  loading,
  refreshing,
  onRefresh,
  mode,
  onModeChange,
}: {
  headSha: string | null;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  mode: CiMode;
  onModeChange: (m: CiMode) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 px-4 pb-2 pt-3">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-inner">
            <Activity className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-wide text-foreground">
              {t("ci.headerTitle")}
            </span>
            {headSha ? (
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
                {headSha.substring(0, 7)}
              </span>
            ) : loading ? (
              <span className="animate-pulse text-[10px] text-muted-foreground/80">
                {t("ci.headerLoading")}
              </span>
            ) : null}
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={refreshing}
          onClick={onRefresh}
          aria-label={t("ci.refreshAria")}
          title={t("ci.refreshAria")}
        >
          <RefreshCw className={refreshing ? "animate-spin" : undefined} />
        </Button>
      </div>

      {/* Mode toggle */}
      <Tabs value={mode} onValueChange={(value) => onModeChange(value as CiMode)}>
        <TabsList className="w-full">
          <TabsTrigger value="runs">{t("ci.modeRuns")}</TabsTrigger>
          <TabsTrigger value="checks">{t("ci.modeChecks")}</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
