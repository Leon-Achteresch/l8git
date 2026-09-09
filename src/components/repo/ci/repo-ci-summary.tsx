import { useTranslation } from "react-i18next";
import { RemoteCiCheck } from "./ci-types";
import { runCategory } from "./workflow-run-list";

export function RepoCiSummary({ checks }: { checks: RemoteCiCheck[] }) {
  const { t } = useTranslation();
  if (!checks.length) return null;
  return (
    <div className="ci-status-overview mb-4" aria-label={t("ci.modeChecks")}>
      {[
        { key: "all", label: t("ci.filterAll"), color: "bg-foreground" },
        { key: "running", label: t("ci.filterRunning"), color: "bg-primary" },
        { key: "failed", label: t("ci.filterFailed"), color: "bg-git-removed" },
        { key: "success", label: t("ci.filterSuccess"), color: "bg-git-added" },
      ].map((item) => (
        <div key={item.key} className="ci-stat !cursor-default">
          <span className="flex items-center gap-2">
            <span className={`size-1.5 rounded-full ${item.color}`} />
            {item.label}
          </span>
          <strong>
            {
              checks.filter(
                (check) =>
                  item.key === "all" || runCategory(check) === item.key,
              ).length
            }
          </strong>
        </div>
      ))}
    </div>
  );
}
