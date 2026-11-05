import { describe, expect, it } from "vitest";
import type { CiJob, CiRun } from "@/lib/github-expansion/ci";
import type { WorkflowInput } from "@/lib/github-expansion/forms";
import { attemptNumbers, coerceInputs, dispatchedRunCandidates, environmentErrors, groupMatrix, initialInputValues, lastGreenBefore, latestDeploymentState, returnedRunId, safeExternalUrl } from "./ci-model";
import { decodeLogText, errorLines, parseLog, searchLog, snippet } from "./logs";
import { errorKind } from "./reads";

const run = (p: Partial<CiRun> = {}): CiRun => ({ id: 1, name: "CI", workflow_id: 7, head_sha: "a".repeat(40), head_branch: "main", path: ".github/workflows/ci.yml", event: "push", status: "completed", conclusion: "failure", run_attempt: 1, created_at: "2026-01-02T00:00:00Z", updated_at: "", html_url: "", ...p });
const job = (p: Partial<CiJob> = {}): CiJob => ({ id: 10, name: "test", head_sha: "a".repeat(40), run_id: 1, run_attempt: 1, status: "completed", conclusion: "failure", started_at: null, completed_at: null, runner_name: null, runner_group_name: null, labels: [], steps: [], html_url: "", ...p });
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

describe("logs", () => {
  const text = "2026-01-01T10:00:00.1234567Z ##[group]Run tests\n2026-01-01T10:00:01.0000000Z ok 1\n2026-01-01T10:00:02.0000000Z ##[error]Process completed with exit code 1.\n";
  it("parses timestamps, groups and exact error markers", () => {
    const lines = parseLog(text);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ n: 1, stamp: "2026-01-01T10:00:00.1234567Z", group: "start" });
    expect(errorLines(lines)).toEqual({ kind: "marker", indexes: [2] });
    expect(snippet(lines, 2, 1, false)).toBe("ok 1\n##[error]Process completed with exit code 1.");
    expect(snippet(lines, 1, 1, true)).toBe("2026-01-01T10:00:01.0000000Z ok 1");
  });
  it("falls back to labelled heuristic matches and searches literally", () => {
    const lines = parseLog("build\nError: boom\nall fine");
    expect(errorLines(lines)).toEqual({ kind: "heuristic", indexes: [1] });
    expect(searchLog(lines, "BOOM").hits).toEqual([1]);
    expect(searchLog(lines, "a.l").hits).toEqual([]);
    expect(searchLog(lines, "l", 1)).toEqual({ hits: [0], capped: true });
  });
  it("refuses zip and oversize payloads instead of decoding them", () => {
    expect(decodeLogText({ base64: b64("hé"), content_type: "text/plain", file_name: "job.txt", size: 3 })).toBe("hé");
    expect(() => decodeLogText({ base64: "", content_type: "application/zip", file_name: "logs.zip", size: 1 })).toThrow("zip");
    expect(() => decodeLogText({ base64: "", content_type: "text/plain", file_name: "a", size: 64 * 1024 * 1024 })).toThrow("too-large");
  });
});

describe("matrix", () => {
  it("groups only repeated `base (variant)` names and keeps singles", () => {
    const { groups, single } = groupMatrix([job({ id: 1, name: "test (ubuntu, 20)" }), job({ id: 2, name: "test (macos, 22)" }), job({ id: 3, name: "lint" }), job({ id: 4, name: "deploy (prod)" })]);
    expect(groups).toEqual([{ base: "test", cells: [{ variant: ["ubuntu", "20"], job: expect.objectContaining({ id: 1 }) }, { variant: ["macos", "22"], job: expect.objectContaining({ id: 2 }) }] }]);
    expect(single.map((j) => j.id)).toEqual([3, 4]);
  });
});

describe("compare + retries", () => {
  it("picks the latest earlier green run of the same workflow", () => {
    const failing = run({ id: 5, created_at: "2026-01-05T00:00:00Z" });
    const runs = [run({ id: 4, conclusion: "success", created_at: "2026-01-04T00:00:00Z" }), run({ id: 3, conclusion: "success", created_at: "2026-01-03T00:00:00Z" }), run({ id: 6, conclusion: "success", created_at: "2026-01-06T00:00:00Z" }), run({ id: 2, workflow_id: 9, conclusion: "success", created_at: "2026-01-04T12:00:00Z" })];
    expect(lastGreenBefore(failing, runs)?.id).toBe(4);
    expect(lastGreenBefore(failing, [])).toBeNull();
  });
  it("bounds attempts to the latest ones", () => {
    expect(attemptNumbers(run({ run_attempt: 3 }))).toEqual([1, 2, 3]);
    expect(attemptNumbers(run({ run_attempt: 12 }), 2)).toEqual([11, 12]);
  });
});

describe("dispatch", () => {
  const schema: WorkflowInput[] = [
    { name: "dry", type: "boolean", description: "", required: false, options: [], default: "true" as unknown as boolean },
    { name: "count", type: "number", description: "", required: true, options: [] },
    { name: "env", type: "environment", description: "", required: false, options: [] },
    { name: "level", type: "choice", description: "", required: true, options: ["low", "high"] },
  ];
  it("builds typed values and checks environments only when known", () => {
    expect(initialInputValues(schema)).toEqual({ dry: true, level: "low" });
    expect(coerceInputs(schema, { dry: false, count: "3", env: "", level: "high" })).toEqual({ dry: false, count: 3, level: "high" });
    expect(coerceInputs(schema, { count: "x" })).toEqual({ count: "x" });
    expect(environmentErrors(schema, { env: "prod" }, ["staging"])).toEqual({ env: "environment" });
    expect(environmentErrors(schema, { env: "prod" }, null)).toEqual({});
  });
  it("matches only new dispatch runs and reads a returned run id", () => {
    const since = Date.parse("2026-01-02T00:00:00Z");
    const base = { workflow_id: 7, event: "workflow_dispatch", head_branch: "main", created_at: "2026-01-02T00:00:01Z" };
    const runs = [run({ id: 1, ...base }), run({ id: 2, ...base }), run({ id: 3, ...base, event: "push" }), { ...run({ id: 4, ...base }), actor: { login: "other" } }, run({ id: 5, ...base, created_at: "2026-01-01T00:00:00Z" })];
    expect(dispatchedRunCandidates(runs, { before: new Set([1]), workflowId: 7, ref: "main", since, login: "me" }).map((r) => r.id)).toEqual([2]);
    expect(returnedRunId({ workflow_run_id: 9 })).toBe(9);
    expect(returnedRunId(null)).toBeNull();
  });
});

describe("deployments + errors", () => {
  it("opens only http(s) links and reads the newest status", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("https://preview.example.com/x")).toBe("https://preview.example.com/x");
    expect(latestDeploymentState([{ id: 1, state: "in_progress", description: null, environment_url: null, log_url: null, created_at: "2026-01-01" }, { id: 2, state: "success", description: null, environment_url: null, log_url: null, created_at: "2026-01-02" }])?.state).toBe("success");
    expect(latestDeploymentState([])).toBeNull();
  });
  it("classifies hub_api error strings", () => {
    expect(errorKind("github.com 403: Resource not accessible by integration")).toBe("permission");
    expect(errorKind("github.com 404: Not Found")).toBe("missing");
    expect(errorKind("github.com 403: API rate limit exceeded")).toBe("rate");
    expect(errorKind("boom")).toBe("other");
  });
});
