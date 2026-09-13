import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, RefreshCw, GitBranch, Workflow, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CiMode } from "./repo-ci-panel";
import { SpinIcon, pulseKeyframes, pulseTransition } from "@/components/motion/kit";
import { m } from "motion/react";

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
    <div className="ci-header">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-inner">
            <Activity className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-semibold tracking-tight text-foreground">
              {t("ci.headerTitle")}
            </span>
            {headSha ? (
              <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                <GitBranch className="size-3" /> HEAD · {headSha.substring(0, 7)}
              </span>
            ) : loading ? (
              <m.span animate={pulseKeyframes} transition={pulseTransition} className="text-[0.625rem] text-muted-foreground/80">
                {t("ci.headerLoading")}
              </m.span>
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
          <SpinIcon icon={RefreshCw} active={refreshing} />
        </Button>
      </div>

      {/* Mode toggle */}
      <Tabs value={mode} onValueChange={(value) => onModeChange(value as CiMode)}>
        <TabsList variant="line" className="ci-nav">
          <TabsTrigger value="runs"><Workflow />{t("ci.modeRuns")}</TabsTrigger>
          <TabsTrigger value="checks"><ShieldCheck />{t("ci.modeChecks")}</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
