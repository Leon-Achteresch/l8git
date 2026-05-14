import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CiCheckDetails } from "./ci-check-details";
import { CiCheckIcon } from "./ci-check-icon";
import { RemoteCiCheck } from "./ci-types";

export function CiCheckRow({ check }: { check: RemoteCiCheck }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const metaParts: string[] = [];
  if (check.ci_kind === "github_check_run") metaParts.push("GitHub Actions");
  else if (check.ci_kind === "github_legacy_status") metaParts.push("GitHub");
  else if (check.ci_kind === "bitbucket_commit_status")
    metaParts.push("Bitbucket");
  else if (check.ci_kind) metaParts.push(check.ci_kind);

  if (check.app_name) metaParts.push(check.app_name);
  if (check.key) metaParts.push(check.key);
  const meta = metaParts.join(" · ");

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
