import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toastError } from "@/lib/error-toast";
import { formatRelative } from "@/lib/format";
import { markNotificationsRead, parseGithubSubjectUrl } from "@/lib/github-expansion/api";
import { subjectKey, useGithubWorkspace, type Snooze } from "@/lib/github-expansion/store";
import { groupInbox, returnSummary, snoozeUntil, type InboxGroup, type InboxSection } from "@/lib/github-ui/inbox-model";
import { inboxVisitKey, useInboxVisit } from "@/lib/github-ui/inbox-visit";
import { adapterFor, useHubStore } from "@/lib/hub/store";
import type { HubAccount, HubNotification } from "@/lib/hub/types";
import { useHubQuery } from "@/lib/hub/use-hub-query";
import { cn } from "@/lib/utils";
import { AlarmClock, ArrowDown, ArrowUp, Check, ChevronDown, Pin } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { EmptyRow, ErrorRow, PageHead, SkeletonRows, openExternal, useHubNav } from "./hub-bits";

const ORDER: InboxSection[] = ["pinned", "me", "others", "other", "snoozed"];

/** GitHub-aware inbox: grouped by subject, waiting-on sections, snooze, pins/priority, digest, queue, batch actions. */
export function HubInbox({ account }: { account: HubAccount }) {
  const { t } = useTranslation();
  const refresh = useHubStore((s) => s.refresh);
  const accounts = useHubStore((s) => s.accounts);
  const navigate = useNavigate();
  const q = useHubQuery(account, "notifications", (ad, a) => ad.notifications(a));
  const subjects = useGithubWorkspace((s) => s.subjects);
  const update = useGithubWorkspace((s) => s.updateSubject);
  const visitKey = inboxVisitKey(account);
  const lastVisit = useInboxVisit((s) => s.lastVisit[visitKey] ?? null);
  const markVisit = useInboxVisit((s) => s.mark);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  // The digest compares against the previous visit; leaving the view records this one.
  useEffect(() => () => markVisit(visitKey), [visitKey, markVisit]);

  const keyOf = (n: HubNotification) => {
    const s = n.url ? parseGithubSubjectUrl(n.url, accounts) : null;
    return s ? subjectKey(s.account, s.repo, s.kind, s.number) : `thread:${n.id}`;
  };
  const list = (q.data ?? []).filter((n) => !done.has(n.id));
  const groups = useMemo(() => groupInbox(list, keyOf, subjects, lastVisit, now), [list.length, q.data, done, subjects, lastVisit, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useMemo(() => returnSummary(list, keyOf, lastVisit), [list.length, q.data, done, lastVisit]); // eslint-disable-line react-hooks/exhaustive-deps
  const snoozedKeys = new Set(groups.filter((g) => g.section === "snoozed").map((g) => g.key));
  const fresh = summary.filter((g) => !snoozedKeys.has(g.subject));

  async function markRead(ids: string[]) {
    setDone((s) => new Set([...s, ...ids]));
    if (account.provider !== "github") {
      for (const id of ids) await adapterFor(account)!.markRead(account, id).catch((e) => { toastError(String(e)); setDone((s) => { const n = new Set(s); n.delete(id); return n; }); });
      return;
    }
    const r = await markNotificationsRead(account, ids);
    if (r.failed.length) {
      setDone((s) => { const n = new Set(s); for (const f of r.failed) n.delete(f.id); return n; });
      toastError(t("inboxx.partial", { ok: r.succeeded.length, failed: r.failed.length, error: r.failed[0].error }));
    } else if (ids.length > 1) toast.success(t("inboxx.markedMany", { count: ids.length }));
  }
  const snooze = (keys: string[], s: Snooze) => keys.forEach((k) => { update(k, { snooze: s }); });
  const selectedGroups = groups.filter((g) => selected.has(g.key));

  const renderGroup = (g: InboxGroup) => {
    const s = subjects[g.key];
    const n = g.latest;
    const open = () => {
      const subj = n.url ? parseGithubSubjectUrl(n.url, accounts) : null;
      update(g.key, { lastVisitedAt: Date.now() });
      if (!subj || subj.account !== account) return n.url && openExternal(n.url);
      void navigate({ to: "/hub", search: subj.kind === "pull" ? { view: "pr", repo: subj.repo, pr: subj.number } : { view: "repo", repo: subj.repo, issue: subj.number } });
    };
    return (
      <div key={g.key} className="group flex min-h-12 items-center gap-3 px-5 py-2 text-[13px] hover:bg-muted/40">
        <input type="checkbox" aria-label={t("inboxx.select", { title: n.title })} checked={selected.has(g.key)}
          onChange={(e) => setSelected((p) => { const x = new Set(p); e.target.checked ? x.add(g.key) : x.delete(g.key); return x; })} />
        <span className={cn("size-2 shrink-0 rounded-full", g.items.some((i) => i.unread) ? "bg-[var(--chart-1)]" : "bg-transparent")} />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={open}>
          <span className="flex items-center gap-1.5">
            {s?.pinned && <Pin className="size-3 shrink-0 text-[var(--hub-accent)]" />}
            <span className="truncate">{n.title}</span>
            {g.newSinceVisit && <span className="shrink-0 rounded bg-primary/15 px-1 text-[10px] text-primary">{t("inboxx.new")}</span>}
            {g.priority > 0 && <span className="shrink-0 text-[10px] text-amber-600">{"!".repeat(g.priority)}</span>}
          </span>
          <span className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono">{n.repo}</span>· {n.type} · {g.kinds.map((k) => k.replace(/_/g, " ")).join(", ")} · {formatRelative(n.updatedAt)}
            {g.items.length > 1 && <span>· {t("inboxx.events", { count: g.items.length })}</span>}
            {s?.snooze && "until" in s.snooze && g.section === "snoozed" && <span>· {t("inboxx.snoozedUntil", { when: new Date(s.snooze.until).toLocaleString() })}</span>}
            {s?.snooze && "untilChangedFrom" in s.snooze && g.section === "snoozed" && <span>· {t("inboxx.snoozedChange")}</span>}
            {s?.note && <span className="truncate italic">· {s.note.split("\n")[0].slice(0, 60)}</span>}
          </span>
        </button>
        <span className="flex items-center gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
          <SnoozeMenu onPick={(sn) => snooze([g.key], sn(n.updatedAt))} onWake={s?.snooze ? () => update(g.key, { snooze: undefined }) : undefined} />
          <Button variant="ghost" size="xs" aria-pressed={!!s?.pinned} onClick={() => update(g.key, { pinned: !s?.pinned })} title={s?.pinned ? t("mine.unpin") : t("mine.pin")}><Pin /></Button>
          <Button variant="ghost" size="xs" onClick={() => update(g.key, { priority: ((s?.priority ?? 0) + 1) % 4 || undefined })} title={t("mine.priority")}>!</Button>
          <Button variant="ghost" size="xs" onClick={() => void markRead(g.items.map((i) => i.id))}><Check />{t("hub.inbox.done")}</Button>
        </span>
      </div>
    );
  };

  return (
    <div>
      <PageHead title={t("hub.nav.inbox")} sub={t("hub.inbox.sub")} />
      <ReviewQueue account={account} />
      {lastVisit && fresh.length > 0 && (
        <div className="mx-5 mb-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs" role="status">
          <p className="font-medium">{t("inboxx.digest", { count: fresh.length, when: formatRelative(new Date(lastVisit).toISOString()) })}</p>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {fresh.slice(0, 5).map((g) => (
              <li key={g.subject} className="truncate">
                {g.latest.title} <span className="font-mono">({g.kinds.map((k) => k.replace(/_/g, " ")).join(", ")})</span>
                {g.events.length > 1 && <span> · {t("inboxx.events", { count: g.events.length })}</span>}
              </li>
            ))}
            {fresh.length > 5 && <li>{t("inboxx.digestMore", { count: fresh.length - 5 })}</li>}
          </ul>
        </div>
      )}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-2 border-y border-border/60 bg-background px-5 py-1.5 text-xs">
          <span>{t("inboxx.selected", { count: selected.size })}</span>
          <Button size="xs" variant="outline" onClick={() => { void markRead(selectedGroups.flatMap((g) => g.items.map((i) => i.id))); setSelected(new Set()); }}><Check />{t("inboxx.markRead")}</Button>
          <SnoozeMenu onPick={(sn) => { selectedGroups.forEach((g) => { snooze([g.key], sn(g.latest.updatedAt)); }); setSelected(new Set()); }} label={t("inboxx.snooze")} />
          <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())}>{t("common.clear")}</Button>
        </div>
      )}
      <div className="border-t border-border/60">
        {q.error ? (
          <ErrorRow error={q.error} onRetry={refresh} />
        ) : q.data === undefined ? (
          <SkeletonRows n={6} />
        ) : q.data === null ? (
          <EmptyRow>{t("hub.inbox.unsupported")}</EmptyRow>
        ) : groups.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-git-added/15 text-git-added"><Check className="size-5" /></span>
            <p className="text-[13px] text-muted-foreground">{t("hub.inbox.zero")}</p>
          </div>
        ) : (
          ORDER.map((sec) => {
            const items = groups.filter((g) => g.section === sec);
            if (!items.length) return null;
            const collapsed = sec === "snoozed" && !showSnoozed;
            return (
              <section key={sec} aria-label={t(`inboxx.section.${sec}`)}>
                <button type="button" onClick={() => sec === "snoozed" && setShowSnoozed((x) => !x)} className="flex w-full items-center gap-1.5 bg-muted/30 px-5 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" aria-expanded={sec === "snoozed" ? !collapsed : undefined}>
                  {t(`inboxx.section.${sec}`)} <span className="font-mono">{items.length}</span>
                  {sec === "snoozed" && <ChevronDown className={cn("size-3 transition-transform", !collapsed && "rotate-180")} />}
                </button>
                {!collapsed && <div className="divide-y divide-border/40">{items.map(renderGroup)}</div>}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function SnoozeMenu({ onPick, onWake, label }: { onPick: (make: (updatedAt: string) => Snooze) => void; onWake?: () => void; label?: string }) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={label ? "outline" : "ghost"} size="xs" title={t("inboxx.snooze")}><AlarmClock />{label}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {(["1h", "tomorrow", "week"] as const).map((p) => (
          <DropdownMenuItem key={p} onSelect={() => onPick(() => ({ until: snoozeUntil(p) }))}>{t(`inboxx.snooze_${p}`)}</DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => onPick((u) => ({ untilChangedFrom: u }))}>{t("inboxx.snoozeChange")}</DropdownMenuItem>
        {onWake && <DropdownMenuItem onSelect={onWake}>{t("inboxx.wake")}</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 39: user-ordered review queue (PR keys from the "Mine" tab), reorderable, opens internally. */
function ReviewQueue({ account }: { account: HubAccount }) {
  const { t } = useTranslation();
  const queue = useGithubWorkspace((s) => s.reviewQueue);
  const setQueue = useGithubWorkspace((s) => s.setReviewQueue);
  const nav = useHubNav();
  const rows = queue.map((key) => {
    try {
      const [scope, kind, number] = JSON.parse(key) as [string, string, number];
      const [provider, host, login, repo] = JSON.parse(scope) as string[];
      return { key, kind, number, repo, mine: provider === account.provider && host === account.host.toLowerCase() && login === account.login.toLowerCase() };
    } catch {
      return { key, kind: "?", number: 0, repo: "?", mine: false };
    }
  });
  if (!rows.length) return null;
  const move = (i: number, d: number) => {
    const n = [...queue];
    const [x] = n.splice(i, 1);
    n.splice(i + d, 0, x);
    setQueue(n);
  };
  return (
    <section className="mx-5 mb-3 rounded-lg border border-border/60 p-2 text-xs" aria-label={t("mine.queue")}>
      <p className="mb-1 font-semibold">{t("inboxx.queue", { count: rows.length })}</p>
      <ol className="space-y-0.5">
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-center gap-2">
            <span className="w-4 text-right text-muted-foreground">{i + 1}.</span>
            <button type="button" disabled={!r.mine || r.kind !== "pull"} className="min-w-0 flex-1 truncate text-left font-mono hover:underline disabled:no-underline disabled:opacity-60"
              onClick={() => nav("pr", r.repo, r.number)}>{r.repo}#{r.number}</button>
            <Button variant="ghost" size="xs" aria-label={t("wb.moveUp")} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
            <Button variant="ghost" size="xs" aria-label={t("wb.moveDown")} disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
            <Button variant="ghost" size="xs" onClick={() => setQueue(queue.filter((k) => k !== r.key))}>{t("common.remove")}</Button>
          </li>
        ))}
      </ol>
    </section>
  );
}
