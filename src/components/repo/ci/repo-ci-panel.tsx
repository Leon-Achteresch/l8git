import { CiChecksList, type RemoteCiCheck } from "@/components/repo/ci/ci-checks-list";
import { toastError } from "@/lib/error-toast";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RepoCiHeader } from "./repo-ci-header";
import { RepoCiSummary } from "./repo-ci-summary";

type RepoCommitChecksPayload = {
  head_sha: string;
  checks: RemoteCiCheck[];
};

export function RepoCiPanel({ path }: { path: string }) {
  const { t } = useTranslation();
  const [checks, setChecks] = useState<RemoteCiCheck[] | null>(null);
  const [headSha, setHeadSha] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await invoke<RepoCommitChecksPayload>("repo_commit_checks", {
        path,
      });
      setHeadSha(res.head_sha.trim() || null);
      setChecks(res.checks);
    } catch (e) {
      toastError(String(e));
      setChecks([]);
      setHeadSha(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [path]);

  useEffect(() => {
    setChecks(null);
    setHeadSha(null);
    setLoading(true);
    void load();
  }, [load]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl">
      <RepoCiHeader
        headSha={headSha}
        loading={loading}
        refreshing={refreshing}
        onRefresh={() => void load()}
      />
      <RepoCiSummary checks={checks ?? []} />
      <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2">
        <CiChecksList
          checks={checks}
          loading={loading}
          emptyLabel={t("ci.noPipelines")}
        />
      </div>
    </div>
  );
}
