import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertTriangle,
  AppWindow,
  Calendar,
  CheckCircle,
  Clock,
  Code2,
  FileText,
  Fingerprint,
  Hash,
  Info,
  Link,
  Loader2,
  MessageSquare,
  Tag,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toastError } from "@/lib/error-toast";
import { RemoteCiCheck, CheckAnnotation } from "./ci-types";

const LEVEL_STYLE: Record<string, string> = {
  failure: "text-git-removed",
  error: "text-git-removed",
  warning: "text-git-modified",
  notice: "text-primary",
};

function AnnotationRow({ ann }: { ann: CheckAnnotation }) {
  const levelStyle =
    LEVEL_STYLE[ann.annotation_level?.toLowerCase() ?? ""] ??
    "text-muted-foreground";
  const lineRange =
    ann.start_line === ann.end_line
      ? `L${ann.start_line}`
      : `L${ann.start_line}–${ann.end_line}`;
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs">
      <div className="flex items-start gap-2">
        <AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${levelStyle}`} />
        <div className="min-w-0 flex-1">
          {ann.title && (
            <div className="font-semibold text-foreground/90">{ann.title}</div>
          )}
          <div className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/80">
            {ann.message}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground/60">{ann.path}</span>
            <span className="opacity-50">{lineRange}</span>
            {ann.annotation_level && (
              <span className={`capitalize font-medium ${levelStyle}`}>
                {ann.annotation_level}
              </span>
            )}
          </div>
          {ann.raw_details && (
            <details className="mt-1">
              <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                Details
              </summary>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-[10px] text-foreground/70">
                {ann.raw_details}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

export function CiCheckDetails({
  check,
  path,
}: {
  check: RemoteCiCheck;
  path?: string;
}) {
  const { t } = useTranslation();
  const [annotations, setAnnotations] = useState<CheckAnnotation[] | null>(
    null,
  );
  const [loadingAnnotations, setLoadingAnnotations] = useState(false);

  const pairs: { icon: React.ReactNode; label: string; value: string }[] = [];

  const push = (
    icon: React.ReactNode,
    label: string,
    value: string | null | undefined,
  ) => {
    if (value != null && String(value).trim() !== "") {
      pairs.push({ icon, label, value: String(value) });
    }
  };

  const kindLabel =
    check.ci_kind === "github_check_run"
      ? "GitHub Actions"
      : check.ci_kind === "github_legacy_status"
        ? "GitHub (Legacy)"
        : check.ci_kind === "bitbucket_commit_status"
          ? "Bitbucket"
          : check.ci_kind;

  push(<Activity className="h-3.5 w-3.5" />, "Art", kindLabel);
  push(<Info className="h-3.5 w-3.5" />, "Status", check.status);
  push(<CheckCircle className="h-3.5 w-3.5" />, "Ergebnis", check.conclusion);
  push(<Fingerprint className="h-3.5 w-3.5" />, "Key", check.key);
  push(<AppWindow className="h-3.5 w-3.5" />, "App", check.app_name);
  push(<Tag className="h-3.5 w-3.5" />, "App-Slug", check.app_slug);
  push(<Hash className="h-3.5 w-3.5" />, "Check-Run-ID", check.check_run_id);
  push(
    <Hash className="h-3.5 w-3.5" />,
    "Check-Suite-ID",
    check.check_suite_id,
  );
  push(<Hash className="h-3.5 w-3.5" />, "Externe ID", check.external_id);
  push(<Hash className="h-3.5 w-3.5" />, "UUID", check.status_uuid);
  push(<Code2 className="h-3.5 w-3.5" />, "Commit", check.head_sha);
  push(<Clock className="h-3.5 w-3.5" />, "Gestartet", check.started_at);
  push(<Clock className="h-3.5 w-3.5" />, "Beendet", check.completed_at);
  push(<Calendar className="h-3.5 w-3.5" />, "Erstellt", check.created_at);
  push(<Calendar className="h-3.5 w-3.5" />, "Aktualisiert", check.updated_at);

  if (
    check.annotations_count != null &&
    check.annotations_count !== undefined
  ) {
    push(
      <MessageSquare className="h-3.5 w-3.5" />,
      "Annotationen",
      String(check.annotations_count),
    );
  }

  push(<Link className="h-3.5 w-3.5" />, "HTML-URL", check.html_url);
  push(<Link className="h-3.5 w-3.5" />, "Details-URL", check.details_url);
  push(
    <FileText className="h-3.5 w-3.5" />,
    "Kurzbeschreibung",
    check.description,
  );
  push(
    <FileText className="h-3.5 w-3.5" />,
    "Ausgabe-Titel",
    check.output_title,
  );
  push(
    <FileText className="h-3.5 w-3.5" />,
    "Ausgabe-Zusammenfassung",
    check.output_summary,
  );
  push(<FileText className="h-3.5 w-3.5" />, "Ausgabe-Text", check.output_text);

  const hasAnnotations =
    path &&
    check.ci_kind === "github_check_run" &&
    check.check_run_id &&
    (check.annotations_count ?? 0) > 0;

  async function loadAnnotations() {
    if (!path || !check.check_run_id) return;
    setLoadingAnnotations(true);
    try {
      const res = await invoke<CheckAnnotation[]>("pr_check_annotations", {
        path,
        checkRunId: check.check_run_id,
      });
      setAnnotations(res);
    } catch (e) {
      toastError(String(e));
      setAnnotations([]);
    } finally {
      setLoadingAnnotations(false);
    }
  }

  return (
    <div className="mt-2 animate-in fade-in slide-in-from-top-2 rounded-xl bg-muted/20 p-4">
      <div className="grid gap-3">
        {pairs.map((p, i) => (
          <div key={i} className="flex items-start gap-3 text-xs">
            <div
              className="mt-0.5 shrink-0 text-muted-foreground"
              title={p.label}
            >
              {p.icon}
            </div>
            <div className="min-w-0 flex-1">
              <span className="mr-2 hidden font-medium text-muted-foreground sm:inline-block">
                {p.label}:
              </span>
              <span className="break-words whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/90">
                {p.value}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Annotations — loaded lazily on demand */}
      {hasAnnotations && annotations === null && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loadingAnnotations}
          onClick={() => void loadAnnotations()}
          className="mt-3"
        >
          {loadingAnnotations ? (
            <Loader2 className="animate-spin" />
          ) : (
            <MessageSquare />
          )}
          {loadingAnnotations
            ? t("ci.annotationsLoading")
            : t("ci.loadAnnotations", { count: check.annotations_count })}
        </Button>
      )}

      {annotations && annotations.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("ci.annotationsTitle", { count: annotations.length })}
          </div>
          {annotations.map((ann, i) => (
            <AnnotationRow key={i} ann={ann} />
          ))}
        </div>
      )}

      {annotations && annotations.length === 0 && (
        <p className="mt-3 text-xs italic text-muted-foreground">
          {t("ci.noAnnotations")}
        </p>
      )}
    </div>
  );
}
