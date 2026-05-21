import { ChevronDown, ChevronRight, ExternalLink, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toastError } from "@/lib/error-toast";
import { CiCheckDetails } from "./ci-check-details";
import { CiCheckIcon } from "./ci-check-icon";
import { RemoteCiCheck } from "./ci-types";

export function CiCheckRow({
  check,
  path,
}: {
  check: RemoteCiCheck;
  path?: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [rerunning, setRerunning] = useState(false);

  const metaParts: string[] = [];
  if (check.ci_kind === "github_check_run") metaParts.push("GitHub Actions");
  else if (check.ci_kind === "github_legacy_status") metaParts.push("GitHub");
  else if (check.ci_kind === "bitbucket_commit_status")
    metaParts.push("Bitbucket");
  else if (check.ci_kind) metaParts.push(check.ci_kind);

  if (check.app_name) metaParts.push(check.app_name);
  if (check.key) metaParts.push(check.key);
  const meta = metaParts.join(" · ");

  // A check run can be re-run once it has a definitive conclusion.
  const canRerun =
    !!path &&
    check.ci_kind === "github_check_run" &&
    !!check.check_run_id &&
    !!check.conclusion;

  async function handleRerun(ev: React.MouseEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!path || !check.check_run_id) return;
    setRerunning(true);
    try {
      // Prefer suite-level re-run when suite ID is available so the entire
      // suite restarts together; fall back to single check-run re-run.
      if (check.check_suite_id) {
        await invoke("pr_rerun_check_suite", {
          path,
          suiteId: check.check_suite_id,
        });
      } else {
        await invoke("pr_rerun_check", {
          path,
          checkRunId: check.check_run_id,
        });
      }
    } catch (e) {
      toastError(String(e));
    } finally {
      setRerunning(false);
    }
  }

  return (
    <div className="group flex flex-col rounded-xl p-2 transition-all hover:bg-muted/40">
      <div
        className="flex cursor-pointer items-center gap-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="shrink-0 p-1">
          <CiCheckIcon check={check} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <span className="text-sm font-semibold leading-tight text-foreground/90 transition-colors group-hover:text-foreground">
            {check.name}
          </span>
          <span className="mt-0.5 truncate text-xs text-muted-foreground/80">
            <span className="font-medium capitalize">
              {check.conclusion ?? check.status}
            </span>
            {meta ? (
              <>
                <span className="mx-1.5 opacity-40">·</span>
                <span className="truncate">{meta}</span>
              </>
            ) : null}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {canRerun && (
            <button
              type="button"
              disabled={rerunning}
              onClick={(ev) => void handleRerun(ev)}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
              title={t("ci.rerun")}
            >
              <RotateCcw className={`h-4 w-4 ${rerunning ? "animate-spin" : ""}`} />
            </button>
          )}
          {check.html_url && (
            <button
              type="button"
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                window.open(check.html_url!, "_blank", "noopener,noreferrer");
              }}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              title={t("ci.openInBrowser")}
            >
              <ExternalLink className="h-4 w-4" />
            </button>
          )}

          <div className="p-2 text-muted-foreground transition-transform">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="pb-2 pl-11 pr-2">
          <CiCheckDetails check={check} />
        </div>
      )}
    </div>
  );
}
