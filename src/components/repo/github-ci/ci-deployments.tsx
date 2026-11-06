import { listDeployments, listDeploymentStatuses, type GithubDeployment, type GithubDeploymentStatus } from "@/lib/github-expansion/api";
import { latestDeploymentState } from "@/lib/github-ci-ui/ci-model";
import { listPendingDeployments, type PendingDeployment } from "@/lib/github-ci-ui/reads";
import type { GithubTarget } from "@/lib/github-ui/target";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorNote, ExtLink, Loading, Muted, shortSha, type RunX } from "./ci-shared";

type StatusEntry = { state: "loading" } | { state: "ready"; items: GithubDeploymentStatus[] } | { state: "error"; error: unknown };

/** 48: deployments for the run's exact SHA plus approvals GitHub says this run is waiting on. `refresh` = host refresh generation. */
export function CiDeployments({ target, run, refresh }: { target: GithubTarget; run: RunX; refresh: number }) {
  const { t } = useTranslation();
  const { account, fullName } = target;
  const [deps, setDeps] = useState<GithubDeployment[] | null>(null);
  const [depsError, setDepsError] = useState<unknown>(null);
  const [hasMore, setHasMore] = useState(false);
  const [statuses, setStatuses] = useState<Record<number, StatusEntry>>({});
  const [pending, setPending] = useState<{ items: PendingDeployment[] } | { error: unknown } | null>(null);

  useEffect(() => {
    let live = true;
    setDeps(null); setDepsError(null); setStatuses({}); setPending(null);
    listDeployments(account, fullName, run.head_sha).then(async (p) => {
      if (!live) return;
      const exact = p.items.filter((d) => d.sha === run.head_sha);
      setDeps(exact);
      setHasMore(p.hasMore);
      for (const d of exact.slice(0, 20)) {
        setStatuses((s) => ({ ...s, [d.id]: { state: "loading" } }));
        listDeploymentStatuses(account, fullName, d.id).then(
          (r) => live && setStatuses((s) => ({ ...s, [d.id]: { state: "ready", items: r.items } })),
          (error) => live && setStatuses((s) => ({ ...s, [d.id]: { state: "error", error } })),
        );
      }
    }, (e) => live && (setDepsError(e), setDeps([])));
    if (run.status !== "completed") {
      listPendingDeployments(account, fullName, run.id).then((items) => live && setPending({ items }), (error) => live && setPending({ error }));
    }
    return () => { live = false; };
  }, [account, fullName, run, refresh]);

  return (
    <div className="space-y-3">
      <Muted>{t("ghci.deploy.scope", { sha: shortSha(run.head_sha) })}</Muted>

      {run.status !== "completed" && (
        <section className="space-y-1">
          <h3 className="font-semibold">{t("ghci.deploy.waiting")}</h3>
          {pending === null ? <Loading /> : "error" in pending ? <ErrorNote error={pending.error} /> : pending.items.length === 0 ? <Muted>{t("ghci.deploy.noWaiting")}</Muted> : (
            <ul className="space-y-1">
              {pending.items.map((p) => (
                <li key={p.environment.id} className="rounded-md border border-border/60 p-1.5">
                  <ExtLink href={p.environment.html_url} className="font-medium">{p.environment.name}</ExtLink>
                  <p className="text-muted-foreground">
                    {p.reviewers.length ? t("ghci.deploy.reviewers", { list: p.reviewers.map((r) => r.reviewer.login ?? r.reviewer.slug ?? r.reviewer.name ?? r.type).join(", ") }) : t("ghci.deploy.noReviewers")}
                    {p.wait_timer > 0 && ` · ${t("ghci.deploy.waitTimer", { minutes: p.wait_timer })}`}
                    {" · "}{p.current_user_can_approve ? t("ghci.deploy.canApprove") : t("ghci.deploy.cannotApprove")}
                  </p>
                  <ExtLink href={run.html_url}>{t("ghci.deploy.reviewOnGithub")}</ExtLink>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="space-y-1">
        <h3 className="font-semibold">{t("ghci.deploy.title")}</h3>
        {depsError != null && <ErrorNote error={depsError} />}
        {deps === null ? <Loading /> : deps.length === 0 && depsError == null ? <Muted>{t("ghci.deploy.none")}</Muted> : (
          <ul className="space-y-1">
            {deps.map((d) => {
              const s = statuses[d.id];
              const latest = s?.state === "ready" ? latestDeploymentState(s.items) : null;
              return (
                <li key={d.id} className="rounded-md border border-border/60 p-1.5">
                  <p><span className="font-medium">{d.environment}</span> <span className="text-muted-foreground">· {d.ref} · {new Date(d.created_at).toLocaleString()}</span></p>
                  {d.description && <p className="text-muted-foreground">{d.description}</p>}
                  {!s || s.state === "loading" ? <Loader2 className="h-3 w-3 animate-spin" aria-label={t("ghci.loading")} />
                    : s.state === "error" ? <ErrorNote error={s.error} />
                    : !latest ? <Muted>{t("ghci.deploy.noStatus")}</Muted> : (
                      <p className="flex flex-wrap gap-x-2">
                        <span className="capitalize">{latest.state.replace(/_/g, " ")}</span>
                        {latest.description && <span className="text-muted-foreground">{latest.description}</span>}
                        {latest.environment_url && <ExtLink href={latest.environment_url}>{t("ghci.deploy.preview")}</ExtLink>}
                        {latest.log_url && <ExtLink href={latest.log_url}>{t("ghci.deploy.log")}</ExtLink>}
                      </p>
                    )}
                </li>
              );
            })}
          </ul>
        )}
        {hasMore && <Muted>{t("ghci.deploy.more")}</Muted>}
        {deps && deps.length > 20 && <Muted>{t("ghci.deploy.statusCap")}</Muted>}
      </section>
    </div>
  );
}
