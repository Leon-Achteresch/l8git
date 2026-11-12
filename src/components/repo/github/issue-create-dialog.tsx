import { formatBackendError } from '@/lib/backend-error';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toastError } from "@/lib/error-toast";
import { createIssue } from "@/lib/github-expansion/api";
import { renderIssueAnswers, validateIssueAnswers, type FormAnswers, type IssueFormField } from "@/lib/github-expansion/forms";
import { submitIssueForm } from "@/lib/github-expansion/issue-forms";
import { initialAnswers, loadTemplateEntries, templateLabel, templatePrefill, type TemplateEntry } from "@/lib/github-ui/issue-forms-ui";
import { issueErrorMessage } from "@/lib/hub/issue-errors";
import { adapterFor, hubRepoPath } from "@/lib/hub/store";
import type { HubAccount, HubChoicePage } from "@/lib/hub/types";
import { Loader2, Tag, Users } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { GhMarkdown } from "./gh-markdown";
import { GhPickPopover, type PickItem } from "./gh-pick-popover";
import { MentionTextarea } from "./mention-textarea";

/** Body text prefilled from a body draft (e.g. "issue from selected diff"). */
export function IssueCreateDialog({ account: a, fullName, open, onOpenChange, initialTitle = "", initialBody = "", onCreated }: {
  account: HubAccount; fullName: string; open: boolean; onOpenChange: (o: boolean) => void;
  initialTitle?: string; initialBody?: string; onCreated?: () => void;
}) {
  const { t } = useTranslation();
  const github = a.provider === "github";
  const [forms, setForms] = useState<TemplateEntry[] | null>(github ? null : []);
  const [listError, setListError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string>("");
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [answers, setAnswers] = useState<FormAnswers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<{ labels: string[]; assignees: string[] }>({ labels: [], assignees: [] });
  const adapter = adapterFor(a);

  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
    setBody(initialBody);
    setChosen("");
    setAnswers({});
    setErrors({});
    setPicked({ labels: [], assignees: [] });
    setListError(null);
    if (github) loadTemplateEntries(a, fullName).then(setForms, (e) => { setForms([]); setListError(formatBackendError(e)); });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const entry = forms?.find((f) => f.path === chosen) ?? null;
  const form = entry?.loaded?.kind === "form" ? entry.loaded.form : null;
  const prefill = templatePrefill(entry, initialTitle, initialBody);
  useEffect(() => {
    setTitle(prefill.title);
    setBody(prefill.body);
    setAnswers(form ? initialAnswers(form) : {});
    setErrors({});
  }, [entry]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (form) {
      const errs = validateIssueAnswers(form, answers);
      setErrors(errs);
      if (Object.keys(errs).length) return;
    }
    setBusy(true);
    try {
      // Template labels/assignees go in the same create request, so GitHub accepts or rejects them atomically.
      const meta = { labels: [...new Set([...prefill.labels, ...picked.labels])], assignees: [...new Set([...prefill.assignees, ...picked.assignees])] };
      const url = !github
        ? await adapter!.createIssue(a, fullName, title.trim(), body, picked)
        : form && !initialBody
          ? (await submitIssueForm(a, fullName, title.trim(), { ...form, ...meta }, answers)).html_url
          : (await createIssue(a, fullName, title.trim(), form ? `${renderIssueAnswers(form, answers)}\n\n${initialBody}` : body, meta)).html_url;
      toast.success(t("hub.issue.created"), { action: { label: t("hub.open"), onClick: () => window.open(url, "_blank", "noopener,noreferrer") } });
      onOpenChange(false);
      onCreated?.();
    } catch (e) {
      toastError(issueErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("hub.issue.newIn", { repo: fullName })}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (title.trim()) void submit(); }}>
          {github && forms === null && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {listError && <p role="alert" className="text-[0.6875rem] text-amber-600">{t("issueForm.listError", { error: listError })}</p>}
          {forms && forms.length > 0 && (
            <label className="text-xs font-medium">
              {t("issueForm.template")}
              <select value={chosen} onChange={(e) => setChosen(e.target.value)} className="mt-1 block h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                <option value="">{t("issueForm.blank")}</option>
                {forms.map((f) => (
                  <option key={f.path} value={f.path} disabled={!f.loaded}>
                    {f.loaded ? `${templateLabel(f)}${f.kind === "markdown" ? " (Markdown)" : ""}` : t("issueForm.invalid", { path: f.path })}
                  </option>
                ))}
              </select>
            </label>
          )}
          {forms?.map((f) => !f.loaded && "error" in f && <p key={f.path} className="text-[0.6875rem] text-amber-600">{t("issueForm.parseError", { path: f.path, error: f.error })}</p>)}
          {(form?.description || (entry?.loaded?.kind === "markdown" && entry.loaded.template.description)) && <p className="text-xs text-muted-foreground">{form?.description || (entry?.loaded?.kind === "markdown" ? entry.loaded.template.description : "")}</p>}
          {(prefill.labels.length > 0 || prefill.assignees.length > 0) && (
            <p className="text-[0.6875rem] text-muted-foreground">{t("issueForm.meta", { labels: prefill.labels.join(", ") || "—", assignees: prefill.assignees.join(", ") || "—" })}</p>
          )}
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("hub.issue.title")} aria-label={t("hub.issue.title")} />
          {form ? (
            form.fields.map((f) => <FormField key={f.id} field={f} value={answers[f.id]} error={errors[f.id]} onChange={(v) => setAnswers((p) => ({ ...p, [f.id]: v }))} path={hubRepoPath(a, fullName)} />)
          ) : (
            <MentionTextarea path={hubRepoPath(a, fullName)} value={body} onChange={setBody} placeholder={t("hub.issue.body")} rows={8} />
          )}
          {(adapter?.issueLabels || adapter?.issueAssignees) && (
            <div className="flex flex-wrap gap-1.5">
              {adapter.issueLabels && <ChoicePicker icon={<Tag className="h-3 w-3" />} title={t("ghx.labels")} load={(p) => adapter.issueLabels!(a, fullName, p)} selected={picked.labels} onApply={(labels) => setPicked((p) => ({ ...p, labels }))} />}
              {adapter.issueAssignees && <ChoicePicker icon={<Users className="h-3 w-3" />} title={t("ghx.assignees")} load={(p) => adapter.issueAssignees!(a, fullName, p)} selected={picked.assignees} onApply={(assignees) => setPicked((p) => ({ ...p, assignees }))} />}
            </div>
          )}
          {form && initialBody && <p className="text-[0.625rem] text-muted-foreground">{t("issueForm.contextAppended")}</p>}
          <DialogFooter>
            <Button type="submit" disabled={busy || !title.trim()}>
              {busy && <Loader2 className="animate-spin" />}
              {t("hub.issue.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChoicePicker({ icon, title, load, selected, onApply }: { icon: ReactNode; title: string; load: (page: number) => Promise<HubChoicePage>; selected: string[]; onApply: (ids: string[]) => void }) {
  // GitLab assignees are numeric ids; remember labels of picked items for the trigger text.
  const [names, setNames] = useState<Record<string, string>>({});
  return (
    <GhPickPopover
      title={title}
      trigger={<Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs">{icon}{selected.length ? selected.map((id) => names[id] ?? id).join(", ") : title}</Button>}
      load={async (p) => { const r = await load(p); setNames((n) => ({ ...n, ...Object.fromEntries(r.items.map((i) => [i.id, i.label])) })); return r; }}
      toItem={(x) => x as PickItem}
      selected={selected}
      onApply={async (ids) => onApply(ids)}
    />
  );
}

function FormField({ field: f, value, error, onChange, path }: { field: IssueFormField; value: FormAnswers[string] | undefined; error?: string; onChange: (v: FormAnswers[string]) => void; path: string }) {
  const { t } = useTranslation();
  if (f.type === "markdown") return <GhMarkdown text={f.value} className="rounded-md bg-muted/30 p-2 text-xs" />;
  const id = `if-${f.id}`;
  const label = (
    <span className="text-xs font-medium">
      {f.label}
      {f.required && <span className="text-rose-500"> *</span>}
      {f.description && <span className="block text-[0.6875rem] font-normal text-muted-foreground">{f.description}</span>}
    </span>
  );
  const err = error && <p id={`${id}-err`} className="text-[0.6875rem] text-rose-500">{t("issueForm.fieldError", { error })}</p>;
  if (f.type === "checkboxes") {
    const checked = Array.isArray(value) ? (value as boolean[]) : [];
    return (
      <fieldset className="space-y-1" aria-describedby={error ? `${id}-err` : undefined}>
        <legend>{label}</legend>
        {f.options.map((o, i) => (
          <label key={o.label} className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={checked[i] === true} onChange={(e) => { const n = [...checked]; n[i] = e.target.checked; onChange(n); }} />
            {o.label}{o.required && <span className="text-rose-500">*</span>}
          </label>
        ))}
        {err}
      </fieldset>
    );
  }
  if (f.type === "dropdown") {
    const cur = Array.isArray(value) ? (value as string[]) : typeof value === "string" && value ? [value] : [];
    return (
      <label className="grid gap-1">
        {label}
        <select id={id} multiple={f.multiple} value={f.multiple ? cur : cur[0] ?? ""} aria-invalid={!!error}
          onChange={(e) => onChange(f.multiple ? [...e.target.selectedOptions].map((o) => o.value) : e.target.value)}
          className="rounded-md border border-input bg-transparent px-2 py-1 text-sm">
          {!f.multiple && <option value="">—</option>}
          {f.options.map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}
        </select>
        {err}
      </label>
    );
  }
  const str = typeof value === "string" ? value : "";
  return (
    <label className="grid gap-1">
      {label}
      {f.type === "input" ? (
        <Input id={id} value={str} placeholder={f.placeholder} aria-invalid={!!error} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <MentionTextarea path={path} value={str} placeholder={f.placeholder} aria-invalid={!!error} rows={f.render ? 6 : 4} className={f.render ? "font-mono text-xs" : "text-sm"} onChange={onChange} />
      )}
      {err}
    </label>
  );
}
