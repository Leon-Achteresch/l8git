import type { MergeReadiness } from "@/lib/github-expansion/api";

export type Tone = "ok" | "fail" | "pending" | "unknown";
export type ReadinessRow = { id: string; tone: Tone; key: string; values?: Record<string, string | number> };
export type BranchRule = { type: string; parameters?: Record<string, unknown> };

const conflicts = (m: MergeReadiness["mergeable"]): ReadinessRow =>
  m === "MERGEABLE" ? { id: "conflicts", tone: "ok", key: "noConflicts" }
  : m === "CONFLICTING" ? { id: "conflicts", tone: "fail", key: "conflicts" }
  : { id: "conflicts", tone: "unknown", key: "conflictsUnknown" };

// GitHub's mergeStateStatus is the only server-side statement that requirements are met.
function requirements(s: string): ReadinessRow {
  switch (s) {
    case "CLEAN":
    case "HAS_HOOKS":
      return { id: "requirements", tone: "ok", key: "reqMet" };
    case "BLOCKED":
      return { id: "requirements", tone: "fail", key: "reqBlocked" };
    case "BEHIND":
      return { id: "requirements", tone: "fail", key: "reqBehind" };
    case "UNSTABLE":
      return { id: "requirements", tone: "pending", key: "reqUnstable" };
    case "DIRTY":
      return { id: "requirements", tone: "fail", key: "reqDirty" };
    case "DRAFT":
      return { id: "requirements", tone: "fail", key: "reqDraft" };
    default:
      return { id: "requirements", tone: "unknown", key: "reqUnknown" };
  }
}

function checks(state: string | undefined | null): ReadinessRow {
  if (state === "SUCCESS") return { id: "checks", tone: "ok", key: "checksOk" };
  if (state === "FAILURE" || state === "ERROR") return { id: "checks", tone: "fail", key: "checksFail" };
  if (state === "PENDING" || state === "EXPECTED") return { id: "checks", tone: "pending", key: "checksPending" };
  return { id: "checks", tone: "unknown", key: "checksNone" };
}

function reviews(decision: string | null, codeOwners: boolean): ReadinessRow {
  if (decision === "APPROVED") return { id: "reviews", tone: "ok", key: "reviewsOk" };
  if (decision === "CHANGES_REQUESTED") return { id: "reviews", tone: "fail", key: "reviewsChanges" };
  if (decision === "REVIEW_REQUIRED") return { id: "reviews", tone: "pending", key: codeOwners ? "reviewsRequiredOwners" : "reviewsRequired" };
  return { id: "reviews", tone: "unknown", key: "reviewsNone" };
}

function threads(r: MergeReadiness, required: boolean): ReadinessRow {
  const open = r.reviewThreads.nodes.filter((n) => !n.isResolved).length;
  const more = r.reviewThreads.pageInfo.hasNextPage;
  const values = { count: open, more: more ? "+" : "" };
  if (open === 0 && !more) return { id: "threads", tone: "ok", key: "threadsNone", values };
  return { id: "threads", tone: required ? "fail" : "pending", key: required ? "threadsRequired" : "threadsOpen", values };
}

const param = (rules: BranchRule[], type: string, name: string) =>
  rules.some((r) => r.type === type && r.parameters?.[name] === true);

export function readinessRows(r: MergeReadiness, rules: BranchRule[] | null): ReadinessRow[] {
  const known = rules ?? [];
  const rows = [
    conflicts(r.mergeable),
    requirements(r.mergeStateStatus),
    checks(r.commits.nodes[0]?.commit.statusCheckRollup?.state),
    reviews(r.reviewDecision, param(known, "pull_request", "require_code_owner_review")),
    threads(r, param(known, "pull_request", "required_review_thread_resolution")),
  ];
  if (r.isDraft) rows.push({ id: "draft", tone: "fail", key: "isDraft" });
  rows.push(
    rules === null
      ? { id: "rules", tone: "unknown", key: "rulesUnknown" }
      : { id: "rules", tone: rules.length ? "pending" : "ok", key: rules.length ? "rulesActive" : "rulesNone", values: { list: [...new Set(rules.map((x) => x.type))].join(", ") } },
  );
  return rows;
}

/** Ready only when GitHub itself reports CLEAN; anything unknown stays unknown. */
export function readinessVerdict(rows: ReadinessRow[]): Tone {
  const req = rows.find((x) => x.id === "requirements")?.tone;
  if (rows.some((x) => x.tone === "fail")) return "fail";
  if (req === "ok" && rows.find((x) => x.id === "conflicts")?.tone === "ok") return "ok";
  if (rows.some((x) => x.tone === "unknown")) return "unknown";
  return "pending";
}

export const mergeQueueRequired = (rules: BranchRule[] | null) => !!rules?.some((r) => r.type === "merge_queue");
