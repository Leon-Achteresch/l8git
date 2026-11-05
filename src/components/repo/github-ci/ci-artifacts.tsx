import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { downloadGithubFile, listArtifacts, type GithubArtifact } from "@/lib/github-expansion/api";
import { MAX_DOWNLOAD_BYTES } from "@/lib/github-ci-ui/logs";
import type { GithubTarget } from "@/lib/github-ui/target";
import { Download, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ErrorNote, formatBytes, Loading, Muted, saveBytes, shortSha, type RunX } from "./ci-shared";

/**
 * 44: metadata listing only; bytes are fetched solely on an explicit per-artifact download.
 * `refresh` is the host's refresh generation: same run/attempt/updated_at still reloads.
 */
export function CiArtifacts({ target, run, refresh }: { target: GithubTarget; run: RunX; refresh: number }) {
  const { t } = useTranslation();
  const { account, fullName } = target;
  const [items, setItems] = useState<GithubArtifact[] | null>(null);
  const [page, setPage] = useState({ page: 1, hasMore: false, total: 0 });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const gen = useRef(0);
  async function load(p: number) {
    const op = gen.current;
    setError(null);
    try {
      const res = await listArtifacts(account, fullName, run.id, p);
      if (gen.current !== op) return;
      setItems((cur) => (p === 1 ? res.items : [...(cur ?? []), ...res.items]));
      setPage({ page: p, hasMore: res.hasMore, total: res.total ?? 0 });
    } catch (e) {
      if (gen.current !== op) return;
      setError(e);
      if (p === 1) setItems([]);
    }
  }
  useEffect(() => {
    gen.current++;
    setItems(null);
    void load(1);
  }, [run.id, account, fullName, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  async function download(a: GithubArtifact) {
    setBusy(a.id);
    try {
      const d = await downloadGithubFile(account, fullName, "artifact", a.id);
      if (await saveBytes(d.file_name || `${a.name}.zip`, d.base64, d.content_type)) toast.success(t("ghci.saved", { size: formatBytes(d.size) }));
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(null);
    }
  }

  if (error != null && !items?.length) return <ErrorNote error={error} />;
  if (!items) return <Loading />;
  if (!items.length) return <Muted>{t("ghci.artifacts.none")}</Muted>;
  return (
    <div className="space-y-1.5">
      <Muted>{t("ghci.artifacts.count", { count: page.total || items.length })}</Muted>
      <table className="w-full text-left">
        <thead className="text-muted-foreground">
          <tr><th className="font-normal">{t("ghci.artifacts.name")}</th><th className="font-normal">{t("ghci.artifacts.size")}</th><th className="font-normal">{t("ghci.artifacts.expiry")}</th><th className="font-normal">{t("ghci.artifacts.commit")}</th><th /></tr>
        </thead>
        <tbody>
          {items.map((a) => {
            const tooBig = a.size_in_bytes > MAX_DOWNLOAD_BYTES;
            const otherCommit = a.workflow_run && a.workflow_run.head_sha !== run.head_sha;
            return (
              <tr key={a.id} className="border-t border-border/40 align-top">
                <td className="py-1 pr-2">
                  <span className="font-medium">{a.name}</span>
                  {a.digest && <div className="max-w-56 truncate font-mono text-[0.625rem] text-muted-foreground" title={a.digest}>{a.digest}</div>}
                </td>
                <td className="py-1 pr-2 tabular-nums">{formatBytes(a.size_in_bytes)}</td>
                <td className="py-1 pr-2">{a.expired ? <span className="text-destructive">{t("ghci.artifacts.expired")}</span> : new Date(a.expires_at).toLocaleString()}</td>
                <td className="py-1 pr-2 font-mono">{a.workflow_run ? shortSha(a.workflow_run.head_sha) : "—"}{otherCommit && <span className="ml-1 font-sans text-destructive">{t("ghci.artifacts.otherCommit")}</span>}</td>
                <td className="py-1 text-right">
                  {a.expired ? null : tooBig ? <Muted>{t("ghci.artifacts.tooBig")}</Muted> : (
                    <Button size="sm" variant="outline" className="h-6 text-[0.6875rem]" disabled={busy !== null} onClick={() => void download(a)} aria-label={t("ghci.artifacts.download", { name: a.name })}>
                      {busy === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}{t("ghci.download")}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error != null && <ErrorNote error={error} />}
      {page.hasMore && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void load(page.page + 1)}>{t("ghci.loadMore")}</Button>}
    </div>
  );
}
