import { useState } from "react";
import { RepoCiPanel } from "@/components/repo/ci/repo-ci-panel";
import { WorkflowRun } from "@/components/repo/ci/ci-types";

const runs: WorkflowRun[] = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  name: index % 3 === 2 ? "Release" : "CI",
  workflow_id: index % 3 === 2 ? 2 : 1,
  run_number: 163 - index,
  status: index === 1 ? "in_progress" : "completed",
  conclusion: index === 1 ? null : index % 4 === 0 ? "failure" : "success",
  head_branch: index % 3 === 2 ? "main" : "development",
  head_sha: "8b011a5bb2488",
  event: index % 2 ? "pull_request" : "push",
  created_at: new Date(Date.UTC(2026, 8, 9, 12 - index)).toISOString(),
  updated_at: new Date(Date.UTC(2026, 8, 9, 12 - index, 8)).toISOString(),
  run_started_at: new Date(Date.UTC(2026, 8, 9, 12 - index)).toISOString(),
  html_url: "https://github.com/example/repo/actions",
  actor_login: "leon",
  actor_avatar: null,
  display_title: [
    "refactor: polish secondary repository views",
    "feat: add configurable pipeline views",
    "Release: improved workspace navigation",
  ][index % 3],
  run_attempt: 1,
  workflow_path: ".github/workflows/ci.yml@refs/heads/main",
}));
export default function CiScene() {
  useState(() => {
    window.__L8GIT_TEST_INVOKE__ = async (command) => {
      if (command === "list_workflow_runs") return runs;
      if (command === "repo_commit_checks")
        return {
          head_sha: runs[0].head_sha,
          checks: [
            {
              name: "Typecheck & lint",
              status: "completed",
              conclusion: "success",
              html_url: null,
              ci_kind: "github_check_run",
            },
            {
              name: "Build desktop app",
              status: "completed",
              conclusion: "failure",
              html_url: null,
              ci_kind: "github_check_run",
              output_summary: "Build failed: missing release artifact.",
            },
          ],
        };
      if (command === "get_workflow_jobs")
        return [
          {
            id: 1,
            run_id: 1,
            name: "Build & test",
            status: "completed",
            conclusion: "success",
            started_at: runs[0].created_at,
            completed_at: runs[0].updated_at,
            html_url: null,
            steps: [
              {
                number: 1,
                name: "Checkout repository",
                status: "completed",
                conclusion: "success",
                started_at: null,
                completed_at: null,
              },
            ],
          },
        ];
      return [];
    };
    return true;
  });
  return (
    <div className="h-screen p-4">
      <RepoCiPanel path="/tmp/ci-design-fixture" />
    </div>
  );
}
