import type { CiJob } from "@/lib/github-expansion/ci";
import { groupMatrix } from "@/lib/github-ci-ui/ci-model";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Loading, Muted, StatusIcon } from "./ci-shared";

/** 45: jobs grouped by the `name (a, b)` pattern; selecting a cell opens its log. */
export function CiMatrix({ jobs, selectedJobId, onSelect }: { jobs: CiJob[] | null; selectedJobId: number | null; onSelect: (id: number) => void }) {
  const { t } = useTranslation();
  const { groups, single } = useMemo(() => groupMatrix(jobs ?? []), [jobs]);
  if (!jobs) return <Loading />;
  if (!jobs.length) return <Muted>{t("ghci.noJobs")}</Muted>;

  const cell = (job: CiJob, label: string) => (
    <button key={job.id} type="button" onClick={() => onSelect(job.id)} aria-pressed={job.id === selectedJobId}
      title={`${job.name} · ${job.conclusion ?? job.status}`}
      className={cn("flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", job.id === selectedJobId && "border-primary bg-primary/5")}>
      <StatusIcon status={job.status} conclusion={job.conclusion} />
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <Muted>{t("ghci.matrix.heuristic")}</Muted>
      {groups.length === 0 && <Muted>{t("ghci.matrix.none")}</Muted>}
      {groups.map((g) => {
        const counts = g.cells.reduce<Record<string, number>>((acc, c) => { const k = c.job.conclusion ?? c.job.status; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
        return (
          <section key={g.base} className="space-y-1">
            <h3 className="font-semibold">{g.base} <span className="font-normal text-muted-foreground">· {Object.entries(counts).map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`).join(", ")}</span></h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-1">
              {g.cells.map((c) => cell(c.job, c.variant.join(" · ")))}
            </div>
          </section>
        );
      })}
      {single.length > 0 && (
        <section className="space-y-1">
          <h3 className="font-semibold">{t("ghci.matrix.other")}</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-1">{single.map((j) => cell(j, j.name))}</div>
        </section>
      )}
    </div>
  );
}
