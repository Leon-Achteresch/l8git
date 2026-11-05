import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useGithubWorkspace } from "@/lib/github-expansion/store";
import { useSubjectKey } from "@/lib/github-ui/review-memory";
import { useReviewTaskStore } from "@/lib/github-ui/review-task-store";
import { reviewTasks } from "@/lib/github-ui/review-tasks";
import type { PrComment } from "@/lib/pr-threads";
import { usePrCapabilities } from "@/lib/pr-provider-store";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, Circle, ListPlus, ListX, Pin, PinOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { TemplateManager } from "./comment-templates";

type Thread = { id: string; resolved: boolean; comment_ids: string[] };

/** Private, local-only workspace for one PR: notes, actionable review tasks, queue/priority, templates. */
export function PrPersonalTab({ path, number, onOpenFile }: { path: string; number: number; onOpenFile: (file: string) => void }) {
  const { t } = useTranslation();
  const key = useSubjectKey(path, "pull", number);
  const subject = useGithubWorkspace((s) => s.subjects[key]);
  const update = useGithubWorkspace((s) => s.updateSubject);
  const queue = useGithubWorkspace((s) => s.reviewQueue);
  const setQueue = useGithubWorkspace((s) => s.setReviewQueue);
  const caps = usePrCapabilities(path);
  const [note, setNote] = useState(subject?.note ?? "");
  const [comments, setComments] = useState<PrComment[] | null>(null);
  const [threads, setThreads] = useState<Thread[] | null>(null);

  useEffect(() => setNote(subject?.note ?? ""), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = window.setTimeout(() => {
      if ((subject?.note ?? "") !== note) update(key, { note: note || undefined });
    }, 400);
    return () => window.clearTimeout(id);
  }, [note, key, subject?.note, update]);

  useEffect(() => {
    let live = true;
    invoke<{ comments: PrComment[] }>("pr_conversation", { path, number }).then((r) => live && setComments(r.comments ?? []), () => live && setComments([]));
    if (caps?.can_resolve_threads) invoke<Thread[]>("pr_review_threads", { path, number }).then((r) => live && setThreads(r), () => live && setThreads(null));
    return () => {
      live = false;
    };
  }, [path, number, caps?.can_resolve_threads]);

  const done = useReviewTaskStore((s) => s.done[key]) ?? {};
  const toggleTask = useReviewTaskStore((s) => s.toggle);
  const tasks = useMemo(() => (comments ? reviewTasks(comments, threads) : []), [comments, threads]);
  const open = tasks.filter((x) => !done[x.id]);
  const finished = tasks.filter((x) => done[x.id]);
  const queued = queue.includes(key);

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4 text-xs">
      <section aria-labelledby="pr-mine-queue" className="flex flex-wrap items-center gap-2">
        <h3 id="pr-mine-queue" className="sr-only">{t("mine.queue")}</h3>
        <Button variant="outline" size="xs" onClick={() => setQueue(queued ? queue.filter((k) => k !== key) : [...queue, key])}>
          {queued ? <ListX className="h-3 w-3" /> : <ListPlus className="h-3 w-3" />}
          {queued ? t("mine.dequeue", { pos: queue.indexOf(key) + 1 }) : t("mine.enqueue")}
        </Button>
        <Button variant="outline" size="xs" aria-pressed={!!subject?.pinned} onClick={() => update(key, { pinned: !subject?.pinned })}>
          {subject?.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          {subject?.pinned ? t("mine.unpin") : t("mine.pin")}
        </Button>
        <label className="flex items-center gap-1">
          {t("mine.priority")}
          <select value={subject?.priority ?? 0} onChange={(e) => update(key, { priority: Number(e.target.value) || undefined })} className="h-6 rounded-md border border-input bg-transparent px-1 text-xs">
            {[0, 1, 2, 3].map((p) => <option key={p} value={p}>{t(`mine.prio${p}`)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">
          {t("mine.waiting")}
          <select value={subject?.waiting ?? ""} onChange={(e) => update(key, { waiting: (e.target.value || undefined) as "me" | "others" | undefined })} className="h-6 rounded-md border border-input bg-transparent px-1 text-xs">
            <option value="">{t("mine.waitingAuto")}</option>
            <option value="me">{t("mine.waitingMe")}</option>
            <option value="others">{t("mine.waitingOthers")}</option>
          </select>
        </label>
      </section>

      <section aria-labelledby="pr-mine-tasks" className="space-y-1.5">
        <h3 id="pr-mine-tasks" className="font-semibold">{t("mine.tasks", { open: open.length, total: tasks.length })}</h3>
        <p className="text-[0.625rem] text-muted-foreground">{t("mine.tasksNote")}</p>
        {comments === null && <p className="text-muted-foreground">{t("common.loading")}</p>}
        {comments && tasks.length === 0 && <p className="text-muted-foreground">{t("mine.noTasks")}</p>}
        <ul className="space-y-1">
          {[...open, ...finished].map((task) => {
            const isDone = !!done[task.id];
            return (
              <li key={task.id} className={`flex items-start gap-2 rounded-md border border-border/50 p-2 ${isDone ? "opacity-60" : ""}`}>
                <button type="button" role="checkbox" aria-checked={isDone} aria-label={isDone ? t("mine.undone") : t("mine.done")} onClick={() => toggleTask(key, task.id)} className="mt-0.5 shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {isDone ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
                <div className="min-w-0 flex-1">
                  <button type="button" className="font-mono text-[0.625rem] text-primary hover:underline" onClick={() => onOpenFile(task.file)}>
                    {task.file}:{task.line}
                  </button>
                  <p className="line-clamp-3 whitespace-pre-wrap">{task.body}</p>
                  <p className="text-[0.625rem] text-muted-foreground">
                    {task.author} · {t("mine.replies", { count: task.replies })}
                    {task.remote === "resolved" && ` · ${t("mine.remoteResolved")}`}
                    {task.remote === "unknown" && ` · ${t("mine.remoteUnknown")}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="pr-mine-notes" className="space-y-1">
        <h3 id="pr-mine-notes" className="font-semibold">{t("mine.notes")}</h3>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} placeholder={t("mine.notesPlaceholder")} className="text-xs" />
        <p className="text-[0.625rem] text-muted-foreground">{t("mine.notesPrivate")}</p>
      </section>

      <section aria-labelledby="pr-mine-tpl" className="space-y-1">
        <h3 id="pr-mine-tpl" className="font-semibold">{t("tpl.templates")}</h3>
        <TemplateManager />
      </section>
    </div>
  );
}
