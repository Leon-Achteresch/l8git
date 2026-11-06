import { describe, expect, it } from "vitest";
import { ciAgentContext, compareCiRuns, inconsistentJobOutcomes, type CiJob, type CiRun } from "./ci";
const run = (patch: Partial<CiRun> = {}): CiRun => ({ id: 1, name: "CI", workflow_id: 7, head_sha: "a".repeat(40), head_branch: "main", path: ".github/workflows/ci.yml", event: "push", status: "completed", conclusion: "failure", run_attempt: 1, created_at: "", updated_at: "", html_url: "https://github.com/a/b/actions/runs/1", ...patch });
const job = (patch: Partial<CiJob> = {}): CiJob => ({ id: 10, name: "test (linux)", head_sha: "a".repeat(40), run_id: 1, run_attempt: 1, status: "completed", conclusion: "failure", started_at: null, completed_at: null, runner_name: null, runner_group_name: null, labels: ["ubuntu"], steps: [], html_url: "https://github.com/a/b/actions/runs/1/job/10", ...patch });
describe("CI evidence", () => {
  it("compares observed metadata and changed matrix jobs", () => {
    const result = compareCiRuns(run(), [job()], run({ run_attempt: 2, conclusion: "success" }), [job({ id: 11, conclusion: "success" })]);
    expect(result.sameCommit).toBe(true);
    expect(result.metadata).toEqual([{ field: "conclusion", before: "failure", after: "success" }, { field: "run_attempt", before: 1, after: 2 }]);
    expect(result.jobs[0].changed).toBe(true);
  });
  it("only flags inconsistent outcomes for the same workflow, SHA and job name", () => {
    const first = { run: run(), jobs: [job()] };
    const second = { run: run({ run_attempt: 2 }), jobs: [job({ id: 11, run_attempt: 2, conclusion: "success" })] };
    expect(inconsistentJobOutcomes([first, second])[0]).toMatchObject({ jobName: "test (linux)", failures: [{ runId: 1, attempt: 1, jobId: 10 }], successes: [{ runId: 1, attempt: 2, jobId: 11 }] });
    expect(inconsistentJobOutcomes([first, { ...second, run: run({ workflow_id: 8 }) }])).toEqual([]);
    expect(inconsistentJobOutcomes([first, { ...second, run: run({ head_sha: "b".repeat(40) }) }])).toEqual([]);
  });
  it("rejects mismatched agent evidence and visibly truncates logs", () => {
    expect(() => ciAgentContext(run(), job({ head_sha: "b".repeat(40) }), "log")).toThrow("different");
    expect(ciAgentContext(run(), job(), "a".repeat(100001))).toContain("Log truncated");
  });
});
