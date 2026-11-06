import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useGithubWorkspace, type CommentTemplate } from "@/lib/github-expansion/store";
import { BookmarkPlus, FileText } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/** Inserts a private (local-only) review comment template into a composer. */
export function TemplateInsertMenu({ onInsert, current }: { onInsert: (body: string) => void; current?: string }) {
  const { t } = useTranslation();
  const templates = useGithubWorkspace((s) => s.templates);
  const save = useGithubWorkspace((s) => s.saveTemplates);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="xs" className="h-6 text-[0.625rem]" title={t("tpl.insert")}>
          <FileText className="mr-1 h-3 w-3" />
          {t("tpl.templates")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {templates.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("tpl.none")}</p>}
        {templates.map((tp) => (
          <DropdownMenuItem key={tp.id} onSelect={() => onInsert(tp.body)} className="flex-col items-start">
            <span className="text-xs font-medium">{tp.name}</span>
            <span className="line-clamp-1 text-[0.625rem] text-muted-foreground">{tp.body}</span>
          </DropdownMenuItem>
        ))}
        {current?.trim() && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                const name = window.prompt(t("tpl.namePrompt"), current.trim().split("\n")[0].slice(0, 40));
                if (name?.trim()) save([...templates, { id: crypto.randomUUID(), name: name.trim(), body: current }]);
              }}
            >
              <BookmarkPlus className="mr-1.5 h-3 w-3" />
              <span className="text-xs">{t("tpl.saveCurrent")}</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Manage templates: rename, edit, delete. */
export function TemplateManager() {
  const { t } = useTranslation();
  const templates = useGithubWorkspace((s) => s.templates);
  const save = useGithubWorkspace((s) => s.saveTemplates);
  const [draft, setDraft] = useState<CommentTemplate | null>(null);
  const commit = (tp: CommentTemplate) => {
    const exists = templates.some((x) => x.id === tp.id);
    save(exists ? templates.map((x) => (x.id === tp.id ? tp : x)) : [...templates, tp]);
    setDraft(null);
  };
  return (
    <div className="space-y-1.5">
      <ul className="space-y-1">
        {templates.map((tp) => (
          <li key={tp.id} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate">{tp.name}</span>
            <Button variant="ghost" size="xs" className="h-5 text-[0.625rem]" onClick={() => setDraft({ ...tp })}>{t("ghx.edit")}</Button>
            <Button variant="ghost" size="xs" className="h-5 text-[0.625rem]" onClick={() => save(templates.filter((x) => x.id !== tp.id))}>{t("common.delete")}</Button>
          </li>
        ))}
      </ul>
      {draft ? (
        <div className="space-y-1">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t("tpl.name")} className="h-7 text-xs" />
          <Textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={3} className="text-xs" />
          <div className="flex gap-1">
            <Button size="xs" className="h-6 text-[0.625rem]" disabled={!draft.name.trim() || !draft.body.trim()} onClick={() => commit({ ...draft, name: draft.name.trim() })}>{t("common.save")}</Button>
            <Button variant="ghost" size="xs" className="h-6 text-[0.625rem]" onClick={() => setDraft(null)}>{t("common.cancel")}</Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="xs" className="h-6 text-[0.625rem]" onClick={() => setDraft({ id: crypto.randomUUID(), name: "", body: "" })}>{t("tpl.add")}</Button>
      )}
    </div>
  );
}
