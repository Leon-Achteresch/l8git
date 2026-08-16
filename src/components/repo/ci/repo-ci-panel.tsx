import { CiChecksList } from "@/components/repo/ci/ci-checks-list";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { toastError } from "@/lib/error-toast";
import { trackWorkflowRuns } from "@/lib/notifications";
import { writeLocalStorageDebounced } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CiDetailPanel } from "./ci-detail-panel";
import { RemoteCiCheck, WorkflowRun } from "./ci-types";
import { RepoCiHeader } from "./repo-ci-header";
import { RepoCiSummary } from "./repo-ci-summary";
import { WorkflowRunList } from "./workflow-run-list";

export type CiMode = "checks" | "runs";

type RepoCommitChecksPayload = {
  head_sha: string;
  checks: RemoteCiCheck[];
};

const LAYOUT_KEY = "l8git.ci-split.layout.v1";

export function RepoCiPanel({ path }: { path: string }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<CiMode>("runs");
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null);

  // Restore persisted split sizes
  const [defaultLayout] = useState<Record<string, number> | undefined>(() => {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return undefined;
    try { return JSON.parse(raw) as Record<string, number>; } catch { return undefined; }
  });

  // ── HEAD Checks ────────────────────────────────────────────────────────────
  const [checks, setChecks] = useState<RemoteCiCheck[] | null>(null);
  const [headSha, setHeadSha] = useState<string | null>(null);
  const [checksLoading, setChecksLoading] = useState(false);
  const [checksRefreshing, setChecksRefreshing] = useState(false);

  const loadChecks = useCallback(async () => {
    setChecksRefreshing(true);
    try {
      const res = await invoke<RepoCommitChecksPayload>("repo_commit_checks", { path });
      setHeadSha(res.head_sha.trim() || null);
      setChecks(res.checks);
    } catch (e) {
      toastError(String(e));
      setChecks([]);
      setHeadSha(null);
    } finally {
      setChecksLoading(false);
      setChecksRefreshing(false);
    }
  }, [path]);

  // ── Workflow Runs ──────────────────────────────────────────────────────────
  const [runs, setRuns] = useState<WorkflowRun[] | null>(null);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsRefreshing, setRunsRefreshing] = useState(false);

  const loadRuns = useCallback(async () => {
    setRunsRefreshing(true);
    try {
      const res = await invoke<WorkflowRun[]>("list_workflow_runs", { path });
      trackWorkflowRuns(path, res);
      setRuns(res);
    } catch (e) {
      toastError(String(e));
      setRuns([]);
    } finally {
      setRunsLoading(false);
      setRunsRefreshing(false);
    }
  }, [path]);

  // ── Load on mount / path change ────────────────────────────────────────────
  useEffect(() => {
    setChecks(null);
    setHeadSha(null);
    setChecksLoading(true);
    setRuns(null);
    setRunsLoading(true);
    setSelectedRun(null);
    void loadChecks();
    void loadRuns();
  }, [loadChecks, loadRuns]);

  const handleRefresh = useCallback(() => {
    if (mode === "checks") void loadChecks();
    else void loadRuns();
  }, [mode, loadChecks, loadRuns]);

  const isRefreshing = mode === "checks" ? checksRefreshing : runsRefreshing;

  const handleRunsRefresh = useCallback(() => {
    void loadRuns();
  }, [loadRuns]);

  const handleRunSelect = useCallback((run: WorkflowRun) => {
    setSelectedRun((prev) => (prev?.id === run.id ? null : run));
  }, []);

  // ── List panel (reused in both split and full layouts) ─────────────────────
  const listPanel = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <RepoCiHeader
        headSha={headSha}
        loading={mode === "checks" ? checksLoading : runsLoading}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        mode={mode}
        onModeChange={(m) => { setMode(m); setSelectedRun(null); }}
      />

      {mode === "checks" ? (
        <>
          <RepoCiSummary checks={checks ?? []} />
          <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2">
            <CiChecksList
              checks={checks}
              loading={checksLoading}
              emptyLabel={t("ci.noPipelines")}
            />
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden pt-1">
          <WorkflowRunList
            runs={runs}
            loading={runsLoading}
            path={path}
            onRefresh={handleRunsRefresh}
            selectedId={selectedRun?.id ?? null}
            onSelect={handleRunSelect}
          />
        </div>
      )}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl shadow-sm ring-1 ring-border/50">
      {selectedRun && mode === "runs" ? (
        <ResizablePanelGroup
          orientation="horizontal"
          id="ci-split"
          defaultLayout={defaultLayout}
          onLayoutChanged={(layout) =>
            writeLocalStorageDebounced(LAYOUT_KEY, JSON.stringify(layout))
          }
        >
          <ResizablePanel
            id="ci-list"
            defaultSize="38%"
            minSize="22%"
            maxSize="55%"
            className="flex min-h-0 flex-col"
          >
            {listPanel}
          </ResizablePanel>
          <ResizableHandle
            withHandle
            className="bg-border/50 transition-colors hover:bg-primary/20"
          />
          <ResizablePanel
            id="ci-detail"
            defaultSize="62%"
            minSize="45%"
            className="flex min-h-0 flex-col"
          >
            <CiDetailPanel
              run={selectedRun}
              path={path}
              onClose={() => setSelectedRun(null)}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        listPanel
      )}
    </div>
  );
}
