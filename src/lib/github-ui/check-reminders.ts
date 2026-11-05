import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";

import { checkReminderReady, type ReminderCheck } from "@/lib/github-expansion/events";
import { useGithubWorkspace, type CheckReminder } from "@/lib/github-expansion/store";
import { hubRepoPath, useHubStore } from "@/lib/hub/store";
import type { HubAccount } from "@/lib/hub/types";
import { notify } from "@/lib/notifications";

/** Raw `pr_checks` row; GitHub sets `head_sha` per check run / status. */
export type PrCheckRow = { name: string; status: string; conclusion: string | null; head_sha?: string | null };

/** Stable id: one reminder per subject + pinned head + exact check name + condition. */
export function reminderId(r: Pick<CheckReminder, "subject" | "headSha" | "checkName" | "when">): string {
  return JSON.stringify([r.subject, r.headSha, r.checkName, r.when]);
}

/** Checks without a head SHA can never satisfy a reminder (the canonical check requires a full pin). */
export function toReminderChecks(rows: PrCheckRow[]): ReminderCheck[] {
  return rows.map((c) => ({ headSha: c.head_sha ?? "", name: c.name, status: c.status.toLowerCase(), conclusion: c.conclusion?.toLowerCase() ?? null }));
}

/** `subjectKey` JSON → the account + repo + PR number needed to poll, or null if no matching account is connected. */
export function reminderTarget(subject: string, accounts: HubAccount[]): { account: HubAccount; repo: string; number: number } | null {
  try {
    const [scope, kind, number] = JSON.parse(subject) as [string, string, number];
    const [provider, host, login, repo] = JSON.parse(scope) as string[];
    const account = accounts.find((a) => a.provider === provider && a.host.toLowerCase() === host && a.login.toLowerCase() === login);
    return kind === "pull" && account && Number.isSafeInteger(number) ? { account, repo, number } : null;
  } catch {
    return null;
  }
}

/**
 * One poll pass. A reminder notifies only when `checkReminderReady` holds (pinned head, exact name, every
 * duplicate run completed) and `claimReminder` wins, so it fires at most once even across overlapping ticks.
 */
export async function pollReminders(fetchChecks: (account: HubAccount, repo: string, number: number) => Promise<PrCheckRow[]>, accounts: HubAccount[], send: typeof notify = notify) {
  const pending = Object.entries(useGithubWorkspace.getState().reminders).filter(([, r]) => r.deliveredAt === null);
  const bySubject = new Map<string, [string, CheckReminder][]>();
  for (const e of pending) bySubject.set(e[1].subject, [...(bySubject.get(e[1].subject) ?? []), e]);
  for (const [subject, list] of bySubject) {
    const target = reminderTarget(subject, accounts);
    if (!target) continue;
    const rows = await fetchChecks(target.account, target.repo, target.number).catch(() => null);
    if (!rows) continue;
    const checks = toReminderChecks(rows);
    for (const [id, r] of list) {
      if (!checkReminderReady(r, checks)) continue;
      if (!useGithubWorkspace.getState().claimReminder(id)) continue;
      const conclusion = checks.filter((c) => c.headSha === r.headSha && c.name === r.checkName).map((c) => c.conclusion ?? "completed");
      void send({
        kind: "checkReminder",
        key: `check-reminder:${id}`,
        title: `#${target.number} ${r.checkName}`,
        body: [...new Set(conclusion)].join(", "),
        target: { view: "pr", path: hubRepoPath(target.account, target.repo), number: target.number },
      });
    }
  }
}

const POLL_MS = 60_000;

/** App-level poller over the canonical reminder store. Mounted once in the root layout. */
export function useCheckReminderPoller() {
  const pending = useGithubWorkspace((s) => Object.values(s.reminders).filter((r) => r.deliveredAt === null).length);
  useEffect(() => {
    if (!pending) return;
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await pollReminders((a, repo, number) => invoke<PrCheckRow[]>("pr_checks", { path: hubRepoPath(a, repo), number }), useHubStore.getState().accounts);
      } finally {
        running = false;
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => window.clearInterval(id);
  }, [pending]);
}
